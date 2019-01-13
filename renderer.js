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
        try { electronFs.writeFileSync(this.filename, JSON.stringify(this.data), 'utf-8'); }
        catch(e) { alert('Не удалось сохранить файл'); }
    }

    this.getFieldValue = function (field) {
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
                // TODO null or empty array?
                // data = data.length > 0 ? data : null
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
            new Field('timeline[]', 'timelines', 'Период', this.generateTimelinesField(data.timelines || []), {}),
            new Field('exhibit[]', 'exhibits', 'Экспонаты', this.generateExhibitsField(data.exhibits || []), {}),
        ]

        if (!isRootLevel) {
            // TODO add fields
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
                new Field('guid', 'id', 'ID', data[i].id || '', {hidden: true}),
                new Field('guid', 'parentTimelineid', 'ParentId', data[i].parentTimelineId, {hidden: true}),
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
                new Field('guid', 'id', 'ID', data[i].id || '', {hidden: true}),
                new Field('guid', 'parentExhibitId', 'ParentId', data[i].parentExhibitId || '', {hidden: true}),
                new Field('string', 'title', 'Название', data[i].title, {}),
                new Field('string', 'uri', 'Ссылка', data[i].uri || '', {}),
                new Field('int', 'Order', '№ п/п', data[i].Order || 1, {hidden: true}),
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
        if (field.attributes.hidden == true) return ''

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
