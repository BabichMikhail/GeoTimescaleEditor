var remote = require('electron').remote
var electronFs = remote.require('fs')
var electronDialog = remote.dialog

function Field(type, jsonFieldName, publicFieldName, value, attributes) {
    this.type = type
    this.jsonFieldName = jsonFieldName
    this.publicFieldName = publicFieldName
    this.value = value
    this.attributes = attributes
    return this
}

function JsonHandler() {
    this.data = {}
    this.form = null
    this.filename = null
    this.extraAttributesById = {}
    this.timelineUniqueIdSet = {}

    this.loadJson = function (filePaths) {
        if (typeof filePaths === undefined) return
        this.filename = filePaths[0]
        electronFs.readFile(this.filename, "utf8",  (err, data)  => {
            if (err) throw errREAD
            this.data = JSON.parse(data)
            this.regenerateForm()
        })
    }

    this.updateData = function () {
        this.data = this.getFieldValue(this.form)
        this.postProcessData(this.data)
    }

    this.saveJson = function () {
        this.updateData()
        try { electronFs.writeFileSync(this.filename, JSON.stringify(this.data), 'utf-8') }
        catch(e) { alert('Не удалось сохранить файл') }
    }

    this.getNewGuid = function () {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16))
    }

    this.postProcessData = function (data) {
        if (data.id == null)
            data.id = this.getNewGuid()

        for (let i = 0; i < (data.timelines || []).length; ++i) {
            data.timelines[i].ParentTimelineId = data.id
            this.postProcessData(data.timelines[i])
        }

        for (let i = 0; i < (data.exhibits || []).length; ++i) {
            data.exhibits[i].id = data.exhibits[i].id || this.getNewGuid()
            data.exhibits[i].parentTimelineId = data.id

            for (let j = 0; j < (data.exhibits[i].contentItems || []).length; ++j) {
                data.exhibits[i].contentItems[j].id = data.exhibits[i].contentItems[j].id || this.getNewGuid()
                data.exhibits[i].contentItems[j].parentExhibitId = data.exhibits[i].id
                data.exhibits[i].contentItems[j].Order = j + 1
            }
        }

        return data
    }

    this.getFieldValue = function (field) {
        if (field.attributes.hidden) return field.value

        let data = null
        switch (field.type) {
            case 'string':
            case 'text':
                data = $(`#${field.id}`).val()
                break
            case 'float':
                data = parseFloat($(`#${field.id}`).val())
                break
            case 'int':
                data = parseInt($(`#${field.id}`).val())
                break;
            case 'contentItem':
            case 'exhibit':
            case 'timeline':
                data = {}
                for (let i = 0; i < field.value.length; ++i)
                    data[field.value[i].jsonFieldName] = this.getFieldValue(field.value[i])
                break
            case 'contentItem[]':
            case 'exhibit[]':
            case 'timeline[]':
                data = []
                for (let i = 0; i < field.value.length; ++i)
                    data[i] = this.getFieldValue(field.value[i])
                if (field.attributes.useNullInsteadEmptyArray && data.length == 0)
                    data = null
                break
            case 'enum':
                data = $(`#${field.id} option:selected`).val()
                break
            case 'guid':
            case 'unknown':
                data = field.value
                break
            default:
                alert(`Unhandled type: ${field.type}`)
        }
        return data
    }

    this.regenerateForm = function () {
        this.form = this.generateTimelineField(this.data, true)
        let html = this.generateFormHtml(this.form, null, {isRoot: true})
        $('#root').html(html)
        this.refreshButtonEventListeners()
    }

    this.getUniqueId = function (idCandidate) {
        while (idCandidate == null || (this.timelineUniqueIdSet[idCandidate] || false))
            idCandidate = Math.floor(Math.random() * 2500000000)
        this.timelineUniqueIdSet[idCandidate] = true
        return idCandidate
    }

    this.generateTimelineField = function (data, isRootLevel) {
        let fieldValue = [
            new Field('string', 'title', 'Название', data.title || '', {}),
            new Field('float', 'Height', 'Высота', data.Height || 0, {}),
            new Field('string', 'Regime', 'Регион', data.Regime || '', {}),
            new Field('float', 'start', 'Начало', data.start || 0, {}),
            new Field('float', 'end', 'Конец', data.end || 0, {}),
            new Field('guid', 'id', 'ID', data.id || null, {hidden: true}),
            new Field('timeline[]', 'timelines', 'Период', this.generateTimelinesField(data.timelines || []), {useNullInsteadEmptyArray: true, hasButtons: true}),
            new Field('exhibit[]', 'exhibits', 'Экспонаты', this.generateExhibitsField(data.exhibits || []), {hasButtons: true}),
        ]

        if (!isRootLevel) {
            let extraFieldValue = [
                new Field('unknown', 'ChildTimelines', null, data.ChildTimelines || null, {}),
                new Field('guid', 'ParentTimelineId', null, data.ParentTimelineId || null, {hidden: true}),
                new Field('unknown', 'FromDay', null, data.FromDay || null, {}),
                new Field('unknown', 'FromMonth', null, data.FromMonth || null, {}),
                new Field('unknown', 'FromYear', null, data.FromYear || null, {}),
                new Field('unknown', 'ToDay', null, data.ToDay || null, {}),
                new Field('unknown', 'ToMonth', null, data.ToMonth || null, {}),
                new Field('unknown', 'ToYear', null, data.ToYear || null, {}),
                new Field('unknown', 'Sequence', null, data.Sequence || null, {}),
                new Field('string', 'Threshold', 'Порог', data.Threshold || '', {}),
                new Field('int', 'UniqueID', 'Уникальный ID', this.getUniqueId(data.UniqueID || null), {hidden: true}),
                new Field('unknown', '__type', null, data.__type || 'TimelineRaw:#Chronozoom.Entities', {}),
            ]
            for (let i = 0; i < extraFieldValue.length; ++i)
                fieldValue[fieldValue.length] = extraFieldValue[i]
        }
        return new Field('timeline', null, null, fieldValue, {})
    }

    this.generateTimelinesField = function (data) {
        let fields = []
        for (let i = 0; i < data.length; ++i)
            fields[i] = this.generateTimelineField(data[i], false)
        return fields
    }

    this.generateExhibitField = function (data) {
        let fieldValue = [
            new Field('guid', 'id', null, data.id || '', {hidden: true}),
            new Field('guid', 'parentTimelineid', null, data.parentTimelineId || null, {hidden: true}),
            new Field('string', 'title', 'Название', data.title || '', {}),
            new Field('float', 'time', 'Время', data.time || 0, {}),
            new Field('contentItem[]', 'contentItems', 'Контент', this.generateExhibitContentItemsField(data.contentItems || []), {hasButtons: true})
        ]
        return new Field('exhibit', null, null, fieldValue, {})
    }

    this.generateExhibitsField = function (data) {
        let fields = []
        for (let i = 0; i < data.length; ++i)
            fields[i] = this.generateExhibitField(data[i])
        return fields
    }

    this.generateExhibitContentItemField = function (data) {
        let fieldValue = [
            new Field('guid', 'id', null, data.id || '', {hidden: true}),
            new Field('guid', 'parentExhibitId', null, data.parentExhibitId || '', {hidden: true}),
            new Field('string', 'title', 'Название', data.title || '', {}),
            new Field('string', 'uri', 'Ссылка', data.uri || '', {}),
            new Field('int', 'Order', null, data.Order || 1, {hidden: true}),
            new Field('string', 'attribution', null, data.attribution || '', {hidden: true}),
            new Field('text', 'description', 'Описание', data.description || '', {}),
            new Field('string', 'mediaSource', 'Медиа источник', data.mediaSource || '', {}),
            new Field('enum', 'mediaType', 'Медиа тип', (data.mediaType || 'audio').toLowerCase(), {enumValues: [['audio', 'audio'], ['deepimage', 'deep image'], ['image', 'image'], ['pdf', 'PDF'], ['picture', 'picture'], ['video', 'video']]}),
        ]
        return new Field('contentItem', null, null, fieldValue, {})
    }

    this.generateExhibitContentItemsField = function (data) {
        let fields = []
        for (let i = 0; i < data.length; ++i)
            fields[i] = this.generateExhibitContentItemField(data)
        return fields;
    }

    this.generateArrayItemButtons = function (id, itemVisible, canMoveUp, canMoveDown, canDelete, canChangeVisibility) {
        if (id == null) return `` // TODO otstoi

        let visibleButtonStyle = ``
        let hiddenButtonStyle = `style="display:none"`
        if (!itemVisible)
            [hiddenButtonStyle, visibleButtonStyle] = [visibleButtonStyle, hiddenButtonStyle]

        let html = `<div class="form-group row col-sm-12">`
        if (canChangeVisibility)
            html += `<div>
                <button class="btn btn-sm btn-info hide-item-button" value="${id}" ${visibleButtonStyle} type="button">Свернуть</button>
                <button class="btn btn-sm btn-info show-item-button" value="${id}" ${hiddenButtonStyle} type="button" >Развернуть</button>
            </div>`
        if (canMoveUp)
            html += `<div style="margin-left:0.5rem"><button class="btn btn-sm btn-warning up-item-button" ${visibleButtonStyle} value="${id}" type="button">&#129049;</button></div>`
        if (canMoveDown)
            html += `<div style="margin-left:0.5rem"><button class="btn btn-sm btn-warning down-item-button" ${visibleButtonStyle} value="${id}" type="button">&#129051;</button></div>`
        if (canDelete)
            html += `<div style="margin-left:0.5rem"><button class="btn btn-sm btn-danger remove-item-button" ${visibleButtonStyle} value="${id}" type="button">x</button></div>`
        return html + `</div>`
    }

    this.generateFormHtml = function (field, parentId, attributes) {
        if (field.attributes.hidden) return ''

        let id = parentId;
        if (id != null && field.jsonFieldName != null)
            id += `-${field.jsonFieldName}`
        else if (id == null && field.jsonFieldName != null)
            id = field.jsonFieldName

        // id with uppercase characters doesn't work in $(`#id`)
        id = typeof id == 'string' ? id.toLowerCase() : null
        field.id = id
        attributes = {...attributes, ...(this.extraAttributesById[id] || {})}

        let html = ``
        switch (field.type) {
            case 'int':
            case 'float':
                html += `<input id="${id}" type="number" value="${field.value}" class="form-control" style="width:780px">`
                break
            case 'string':
                html += `<input id="${id}" type="text" value="${field.value}" class="form-control" style="width:780px">`
                break
            case 'text':
                html += `<textarea id="${id}" class="form-control" rows="5" style="width:780px">${field.value}</textarea>`
                break
            case 'timeline':
                html += `<div style="width:960px"><hr>${this.generateArrayItemButtons(id, attributes.visible || true, !attributes.isFirst && !attributes.isRoot, !attributes.isLast && !attributes.isRoot, !attributes.isRoot, !attributes.isRoot)}<div>`
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], id, {})
                html += `</div></div>`
                break
            // TODO more copy-paste...
            case 'timeline[]':
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], `${id}-timeline-${i}`, {isFirst: i == 0, isLast: i == field.value.length - 1})
                break
            case 'exhibit':
                html += `<div style="width:960px"><hr>${this.generateArrayItemButtons(id, attributes.visible || true, !attributes.isFirst && !attributes.isRoot, !attributes.isLast && !attributes.isRoot, !attributes.isRoot, !attributes.isRoot)}<div>`
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], id, {})
                html += `</div></div>`
                break
            case 'exhibit[]':
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], `${id}-exhibit-${i}`, {isFirst: i == 0, isLast: i == field.value.length - 1})
                break
            case 'contentItem':
                html += `<div style="width:960px"><hr>${this.generateArrayItemButtons(id, attributes.visible || true, !attributes.isFirst && !attributes.isRoot, !attributes.isLast && !attributes.isRoot, !attributes.isRoot, !attributes.isRoot)}<div>`
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], id, {})
                html += `</div></div>`
                break
            case 'contentItem[]':
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], `${id}-contentitem-${i}`, {isFirst: i == 0, isLast: i == field.value.length - 1})
                break
            case 'enum':
                values = field.attributes.enumValues || null
                if (!Array.isArray(values))
                    alert('enum values is null')

                html += `<div style="width:780px"><select id="${id}" class="form-control">`
                for (let i = 0; i < values.length; ++i) {
                    selected = values[i][0] == field.value ? ` selected` : ``;
                    html += `<option value="${values[i][0]}"${selected}>${values[i][1]}</option>`
                }
                html += `</select></div>`
                break
            case 'guid':
            case 'unknown':
                break
            default:
                alert(`Unhandled type: ${field.type}`)
        }

        if (field.publicFieldName == null && html != ``)
            html = `<div class="col-sm-12">${html}</div>`
        else if (field.publicFieldName != null) {
            let buttonsId = `${id}-buttons`
            let visibleButtonsHtml = ``
            let hiddenButtonsHtml = ``
            if (field.attributes.hasButtons) {
                buttonValue = `${field.type} ${buttonsId} ${id}`
                visibleButtonsHtml = `<div class="col-sm-12">
                    <button class="btn btn-sm btn-primary add-button" value="${buttonValue}" type="button">Добавить</button>
                    <button class="btn btn-sm btn-info hide-button" value="${buttonValue}" type="button">Свернуть</button>
                </div>`
                hiddenButtonsHtml = `<div class="col-sm-12" style="display:none">
                    <button class="btn btn-sm btn-info show-button" value="${buttonValue}" type="button">Развернуть</button>
                </div>`
            }

            html = `<div class="form-group row">
                <label class="col-sm-2 col-form-label" for="${id}">${field.publicFieldName}</label>
                <div id="${buttonsId}" class="col-sm-10">${visibleButtonsHtml}${hiddenButtonsHtml}${html}
                </div>
            </div>`
        }

        return html
    }

    this.getFormField = function (id) {
        let field = this.form
        while ((field.id || '') != id) {
            switch (field.type) {
                case 'timeline':
                case 'timeline[]':
                case 'exhibit':
                case 'exhibit[]':
                case 'contentItem':
                case 'contentItem[]':
                    for (let i = 0; i < field.value.length; ++i) {
                        if (id.indexOf(field.value[i].id) != -1) {
                            field = field.value[i]
                            continue
                        }
                    }
                    break
                default:
                    throw `Not implemented type: ${field.type}`
            }
        }

        if (field == null || typeof field == 'undefined')
            throw 'Logic exception'
        return field
    }

    this.setExtraAttribute = function (id, attribute, value) {
        let attributes = (this.extraAttributesById[id] || {})
        attributes[attribute] = value
        this.extraAttributesById[id] = attributes
    }

    this.handleAddButtonClick = function (type, buttonsId, fieldId) {
        let field = this.getFormField(fieldId)
        let fieldGenerator = null
        let newField = null
        switch (type) {
            case 'timeline[]':
                newField = jsonHandler.generateTimelineField({}, false)
                break
            case 'exhibit[]':
                newField = jsonHandler.generateExhibitField({}, false)
                break
            case 'contentItem[]':
                newField = jsonHandler.generateExhibitContentItemField({}, false)
                break
            default:
                throw `Not implemented type: ${type}`
        }

        field.value[field.value.length] = newField
        this.updateData()
        this.regenerateForm()
    }

    this.handleChangeVisibilityClick = function (type, buttonsId, fieldId, visible) {
        let block = $(`#${buttonsId}`)
        let childs1 = [0]
        let childs2 = [1]

        for (let i = 2; i <= block.children().length; ++i)
            childs1[i - 1] = i
        if (visible)
            [childs1, childs2] = [childs2, childs1]

        for (let i = 0; i < childs1.length; ++i)
            block.children().eq(childs1[i]).hide('slow')
        for (let i = 0; i < childs2.length; ++i)
            block.children().eq(childs2[i]).show('slow')
    }

    this.handleChangeItemVisibilityButtonClick = function (fieldId, visible) {
        this.setExtraAttribute(fieldId, 'visible', visible)
        let splitedId = fieldId.split('-')
        let index = parseInt(splitedId[splitedId.length - 1])
        splitedId.pop()
        splitedId.pop()

        let parentId = splitedId.join('-')
        let parentField = this.getFormField(parentId)
        let block = $(`#${parentId}-buttons`).children().eq(index + 2).children().eq(0)
        block.children().eq(1).html(this.generateArrayItemButtons(fieldId, visible, index > 0, index < parentField.value.length - 1, true, true))

        let child = block.children().eq(2)
        if (visible)
            child.show('slow')
        else
            child.hide('slow')
    }

    this.handleSwapItemButtonClick = function (fieldId, otherIndexOffset) {
        let splitedId = fieldId.split('-')
        let index1 = parseInt(splitedId[splitedId.length - 1])
        let index2 = index1 + otherIndexOffset
        splitedId.pop()
        splitedId.pop()

        let parentField = this.getFormField(splitedId.join('-'))
        if (0 > index2 || index2 > parentField.value.length - 1) return
        [parentField.value[index1], parentField.value[index2]] = [parentField.value[index2], parentField.value[index1]]

        this.updateData()
        this.regenerateForm()
    }

    this.handleRemoveItemButtonClick = function (fieldId) {
        splitedId = fieldId.split('-')
        let index = parseInt(splitedId[splitedId.length - 1])
        splitedId.pop()
        splitedId.pop()

        this.getFormField(splitedId.join('-')).value.splice(index, 1)

        this.updateData()
        this.regenerateForm()
    }

    this.prepareButtonClick = function (buttonValue) {
        return buttonValue.split(' ')
    }

    this.refreshButtonEventListeners = function () {
        let data = [
            {class: '.add-button', action: function (a, b, c) { jsonHandler.handleAddButtonClick(a, b, c) }},
            {class: '.hide-button', action: function (a, b, c) { jsonHandler.handleChangeVisibilityClick(a, b, c, false) }},
            {class: '.show-button', action: function (a, b, c) { jsonHandler.handleChangeVisibilityClick(a, b, c, true) }},
            {class: '.hide-item-button', action: function (a) { jsonHandler.handleChangeItemVisibilityButtonClick(a, false) }},
            {class: '.show-item-button', action: function (a) { jsonHandler.handleChangeItemVisibilityButtonClick(a, true) }},
            {class: '.up-item-button', action: function (a) { jsonHandler.handleSwapItemButtonClick(a, -1) }},
            {class: '.down-item-button', action: function (a) { jsonHandler.handleSwapItemButtonClick(a, 1) }},
            {class: '.remove-item-button', action: function (a) { jsonHandler.handleRemoveItemButtonClick(a) }},
        ]
        for (let i = 0; i < data.length; ++i) {
            let elements = document.querySelectorAll(data[i].class)
            for (let j = 0; j < elements.length; ++j) {
                if (!elements[j].hasEventListener) {
                    elements[j].hasEventListener = true
                    elements[j].addEventListener('click', function (event) {
                        // TODO correct argument parsing
                        let [a, b, c] = jsonHandler.prepareButtonClick(event.srcElement.value)
                        data[i].action(a, b, c)
                        jsonHandler.refreshButtonEventListeners()
                    })
                }
            }
        }
    }

    return this
}
let jsonHandler = new JsonHandler()
jsonHandler.regenerateForm()

document.querySelector('#loadJsonFile').addEventListener('click', function () {
    electronDialog.showOpenDialog(null, {
        properties: ['openFile'],
        filters: [{name: 'All Files', extensions: ['json']}]
    }, function (data) { jsonHandler.loadJson(data) })
})
let saveAsFunction = function () {
    electronDialog.showSaveDialog(null, {}, function (filename) {
        if (typeof filename != undefined) {
            jsonHandler.filename = filename
            jsonHandler.saveJson()
        }
    })
}
document.querySelector('#saveJsonFile').addEventListener('click', function () {
    jsonHandler.filename == null ? saveAsFunction() : jsonHandler.saveJson()
})
document.querySelector('#saveAsJsonFile').addEventListener('click', function () {
    saveAsFunction()
})
