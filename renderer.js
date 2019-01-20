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
    this.eventListeners = {}

    this.loadJson = function (filePaths) {
        if (typeof filePaths === undefined) return
        this.filename = filePaths[0]
        electronFs.readFile(this.filename, "utf8",  (err, data)  => {
            if (err) throw errREAD
            this.data = JSON.parse(data)
            this.regenerateForm()
            console.log(this.form)
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
                if (field.attributes.use_null_instead_empty_array && data.length == 0)
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
        this.eventListeners = {}
        this.refreshButtonEventListeners()
    }

    this.generateTimelineField = function (data, isRootLevel) {
        let fieldValue = [
            new Field('string', 'title', 'Название', data.title || '', {}),
            new Field('float', 'Height', 'Высота', data.Height || 0, {}),
            new Field('string', 'Regime', 'Регион', data.Regime || '', {}),
            new Field('float', 'start', 'Начало', data.start || 0, {}),
            new Field('float', 'end', 'Конец', data.end || 0, {}),
            new Field('guid', 'id', 'ID', data.id || '', {hidden: true}),
            new Field('timeline[]', 'timelines', 'Период', this.generateTimelinesField(data.timelines || []), {use_null_instead_empty_array: true, hasButtons: true}),
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
                new Field('string', 'Threshold', 'Порог', data.Threshold || null, {}),
                new Field('int', 'UniqueID', 'Уникальный ID', data.UniqueID || null, {}),
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

    this.generateExhibitsField = function (data) {
        let fields = []
        for (let i = 0; i < data.length; ++i) {
            let fieldValue = [
                new Field('guid', 'id', null, data[i].id || '', {hidden: true}),
                new Field('guid', 'parentTimelineid', null, data[i].parentTimelineId, {hidden: true}),
                new Field('string', 'title', 'Название', data[i].title || '', {}),
                new Field('float', 'time', 'Время', data[i].time || 0, {}),
                new Field('contentItem[]', 'contentItems', 'Контент', this.generateExhibitContentItemsField(data[i].contentItems || []), {hasButtons: true})
            ]
            fields[i] = new Field('exhibit', null, null, fieldValue, {})
        }
        return fields
    }

    this.generateExhibitContentItemsField = function (data) {
        let fields = []
        for (let i = 0; i < data.length; ++i) {
            let fieldValue = [
                new Field('guid', 'id', null, data[i].id || '', {hidden: true}),
                new Field('guid', 'parentExhibitId', null, data[i].parentExhibitId || '', {hidden: true}),
                new Field('string', 'title', 'Название', data[i].title, {}),
                new Field('string', 'uri', 'Ссылка', data[i].uri || '', {}),
                new Field('int', 'Order', null, data[i].Order || 1, {hidden: true}),
                new Field('string', 'attribution', 'Attribution?', data[i].attribution || '', {}),
                new Field('text', 'description', 'Описание', data[i].description || '', {}),
                new Field('string', 'mediaSource', 'Медиа источник', data[i].mediaSource || '', {}),
                new Field('enum', 'mediaType', 'Медиа тип', (data[i].mediaType || 'audio').toLowerCase(), {enumValues: [['audio', 'audio'], ['deepimage', 'deep image'], ['image', 'image'], ['pdf', 'PDF'], ['picture', 'picture'], ['video', 'video']]}),
            ]
            fields[i] = new Field('contentItem', null, null, fieldValue, {})
        }
        return fields;
    }

    this.generateFormHtml = function (field, parentId) {
    this.generateFormHtml = function (field, parentId, attributes) {
        if (field.attributes.hidden) return ''

        let id = parentId;
        if (id != null && field.jsonFieldName != null)
            id += '-' + field.jsonFieldName
        else if (id == null && field.jsonFieldName != null)
            id = field.jsonFieldName

        // id with uppercase characters doesn't work in $(`#id`)
        id = typeof id == 'string' ? id.toLowerCase() : null
        field.id = id

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
                html += `<div style="width:960px">`
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], id, {})
                html += `</div>`
                break
            // TODO
            case 'timeline[]':
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], `${id}-timeline-${i}`, {isFirst: i == 0, isLast: i == field.value.length - 1})
                break
            case 'exhibit':
                html += `<div style="width:960px">`
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], id, {})
                html += `</div>`
                break
            case 'exhibit[]':
                html += `<div>`
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], `${id}-exhibit-${i}`, {isFirst: i == 0, isLast: i == field.value.length - 1})
                html += `</div>`
                break
            case 'contentItem':
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], id, {})
                break
            case 'contentItem[]':
                html += `<div style="width:960px">`
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], `${id}-content-item-${i}`, {isFirst: i == 0, isLast: i == field.value.length - 1})
                html += `</div>`
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

        if (field.publicFieldName == null && html != ``) {
            html = `<div class="col-sm-12">` + html + `</div>`
        }
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
                <div id="${buttonsId}" class="col-sm-10">${visibleButtonsHtml}${hiddenButtonsHtml}
            ` + html + `</div></div>`
        }

        return html
    }

    this.prepareButtonClick = function (buttonValue) {
        let valueComponents = buttonValue.split(' ')
        if (valueComponents.length != 3)
            alert('invalid button value')
        return valueComponents
    }

    this.getFormField = function (id) {
        field = this.form
        while ((field.id || '') != id) {
            switch (field.type) {
                case 'timeline':
                    for (let i = 0; i < field.value.length; ++i) {
                        if (id.indexOf(field.value[i].id) == 0) {
                            field = field.value[i]
                            continue
                        }
                    }
                    break
                case 'string':
                    break
                default:
                    throw `Not implemented type: ${field.type}`
            }
        }

        if (field == null)
            throw 'Logic exception'
        return field
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
                newField = jsonHandler.generateTimelineField({}, false) // TODO fix it
                break
            case 'content-item[]':
                newField = jsonHandler.generateTimelineField({}, false) // TODO fix it
                break
            default:
                throw `Not implemented type: ${type}`
        }

        field.value[field.value.length] = newField
        this.updateData()
        this.regenerateForm()
    }

    this.handleHideButtonClick = function (type, buttonsId, fieldId) {
        let block = $(`#${buttonsId}`)
        block.children().eq(0).hide('slow')
        block.children().eq(1).show('slow')
        for (let i = 2; i <= block.children().length; ++i)
            block.children().eq(i).hide('slow')
    }

    this.handleShowButtonClick = function (type, buttonsId, fieldId) {
        let block = $(`#${buttonsId}`)
        block.children().eq(0).show('slow')
        block.children().eq(1).hide('slow')
        for (let i = 2; i <= block.children().length; ++i)
            block.children().eq(i).show('slow')
    }

    this.refreshButtonEventListeners = function () {
        let data = [
            {class: '.add-button', action: function (t, b, c) { jsonHandler.handleAddButtonClick(t, b, c) }},
            {class: '.hide-button', action: function (t, b, c) { jsonHandler.handleHideButtonClick(t, b, c) }},
            {class: '.show-button', action: function (t, b, c) { jsonHandler.handleShowButtonClick(t, b, c) }},
        ]
        for (let i = 0; i < data.length; ++i) {
            let elements = document.querySelectorAll(data[i].class)
            for (let j = 0; j < elements.length; ++j) {
                let key = `${data[i].class}-${elements[j].value}`
                if (!this.eventListeners[key]) {
                    this.eventListeners[key] = true
                    elements[j].addEventListener('click', function (event) {
                        let [type, buttonsId, fieldId] = jsonHandler.prepareButtonClick(event.srcElement.value)
                        data[i].action(type, buttonsId, fieldId)
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
