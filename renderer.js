var remote = require('electron').remote
var electronFs = remote.require('fs')
var electronDialog = remote.dialog

function Field(type, jsonFieldName, publicFieldName, value, restrictions) {
    this.type = type
    this.jsonFieldName = jsonFieldName
    this.publicFieldName = publicFieldName
    this.value = value
    this.restrictions = restrictions
    return this
}

function GetJsonHandler () {
    this.data = {}
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
        // TODO read form
        alert("save")
    }

    this.regenerateForm = function () {
        let html = this.generateFormHtml(this.generateTimelineField(this.data, true), null)
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
            fields[i] = new Field('contentItem', null, 'Контент', fieldValue, {})
        }
        return fields;
    }

    this.generateFormHtml = function (field, parentId) {
        let id = parentId;
        if (id != null && field.jsonFieldName != null)
            id += '-' + field.jsonFieldName
        else if (id == null && field.jsonFieldName != null)
            id = field.jsonFieldName

        // TODO restrictions.hidden
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
                    html += this.generateFormHtml(field.value[i], `${id}-timeline[${i}]`)
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
                    html += this.generateFormHtml(field.value[i], `${id}-exhibit[${i}]`)
                html += `</div>`
                break
            case 'contentItem':
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], id)
                break
            case 'contentItem[]':
                for (let i = 0; i < field.value.length; ++i)
                    html += this.generateFormHtml(field.value[i], `${id}-contentItem[${i}]`)
                break
            default:
                alert('Unhandled type: ' + field.type)
        }

        return html + (field.publicFieldName == null ?  `</div>` : `</div></div>`)
    }

    return this
}
let jsonHandler = new GetJsonHandler()

document.querySelector('#loadJsonFile').addEventListener('click', function () {
    electronDialog.showOpenDialog(null, {
        properties: ['openFile'],
        filters: [{name: 'All Files', extensions: ['json']}]
    }, function (data) { jsonHandler.loadJson(data) })
})
document.querySelector('#saveJsonFile').addEventListener('click', jsonHandler.saveJson)
