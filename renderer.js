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

function JsonHandler () {
    this.data = {}
    this.form = null
    this.filename = null

    this.loadJson = function (filePaths) {
        if (typeof filePaths === undefined) return
        this.filename = filePaths[0]
        electronFs.readFile(this.filename, "utf8",  (err, data)  => {
            if (err) throw errREAD
            this.data = JSON.parse(data)
            this.regenerateForm()
        })
    }

    this.saveJson = function () {
        this.data = this.getFieldValue(this.form)
        this.postProcessData(this.data)
        try { electronFs.writeFileSync(this.filename, JSON.stringify(this.data), 'utf-8') }
        catch(e) { alert('Не удалось сохранить файл') }
    }

    this.getNewGuid = function () {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16))
    }

    this.postProcessData = function(data) {
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
            case 'guid':
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
        let html = this.generateFormHtml(this.form, null)
        $('#root').html(html)
    }

    this.generateTimelineField = function(data, isRootLevel) {
        let fieldValue = [
            new Field('string', 'title', 'Название', data.title || '', {}),
            new Field('float', 'Height', 'Высота', data.Height || 0, {}),
            new Field('string', 'Regime', 'Регион', data.Regime || '', {}),
            new Field('float', 'start', 'Начало', data.start || 0, {}),
            new Field('float', 'end', 'Конец', data.end || 0, {}),
            new Field('guid', 'id', 'ID', data.id || '', {hidden: true}),
            new Field('timeline[]', 'timelines', 'Период', this.generateTimelinesField(data.timelines || []), {use_null_instead_empty_array: true}),
            new Field('exhibit[]', 'exhibits', 'Экспонаты', this.generateExhibitsField(data.exhibits || []), {}),
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
                new Field('contentItem[]', 'contentItems', 'Контент', this.generateExhibitContentItemsField(data[i].contentItems || []), {})
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
                new Field('string', 'mediaType', 'Медиа тип', data[i].mediaType || '', {}), // Тут, наверно, какой-то enum
            ]
            fields[i] = new Field('contentItem', null, null, fieldValue, {})
        }
        return fields;
    }

    this.generateFormHtml = function (field, parentId) {
        if (field.attributes.hidden) return ''

        let id = parentId;
        if (id != null && field.jsonFieldName != null)
            id += '-' + field.jsonFieldName
        else if (id == null && field.jsonFieldName != null)
            id = field.jsonFieldName

        // id with uppercase characters doesn't work in $(`#id`)
        id = typeof id == 'string' ? id.toLowerCase() : null
        field.id = id

        let html = field.publicFieldName == null
            ? `<div class="col-sm-12">`
            : `
                <div class="form-group row">
                    <label class="col-sm-2 col-form-label" for="${id}">${field.publicFieldName}</label>
                    <div class="col-sm-10">`

        switch (field.type) {
            case 'int':
            case 'float':
                html += `<input id="${id}" type="number" value="${field.value}" class="form-control">`
                break
            case 'string':
                html += `<input id="${id}" type="text" value="${field.value}" class="form-control">`
                break
            case 'text':
                html += `<textarea id="${id}" class="form-control" rows="5">${field.value}</textarea>`
                break
            case 'guid':
                html += `<input id="${id}" type="text" value="${field.value}">`
                break
            case 'timeline':
                html += `<div>`
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], id)
                html += `</div>`
                break
            case 'timeline[]':
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], `${id}-timeline-${i}`)
                break
            case 'exhibit':
                html += `<div>`
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], id)
                html += `</div>`
                break
            case 'exhibit[]':
                html += `<div>`
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], `${id}-exhibit-${i}`)
                html += `</div>`
                break
            case 'contentItem':
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], id)
                break
            case 'contentItem[]':
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], `${id}-content-item-${i}`)
                break
            case 'unknown':
                break
            default:
                alert(`Unhandled type: ${field.type}`)
        }

        return html + (field.publicFieldName == null ?  `</div>` : `</div></div>`)
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
