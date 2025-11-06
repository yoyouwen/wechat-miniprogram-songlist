// 云端共享 + 实时监听 + 输入防抖写库 + 分组管理跳转
const db = wx.cloud.database()

// 当前时间 "HH:MM"
function nowHM() {
  var d = new Date()
  function pad(n){ return n < 10 ? '0'+n : ''+n }
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// 稳定配色：同名舞者同色（HSL 马卡龙）
function colorFor(name) {
  var s = String(name || '未填写'), h = 0
  for (var i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) >>> 0
  h = h % 360
  return 'hsl(' + h + ', 70%, 88%)'
}

/* —— 写库防抖（每文档合并字段） —— */
var UPDATE_DELAY = 500; // ms
var pendingPatch = Object.create(null);  // { docId: {field: value} }
var pendingTimer = Object.create(null);

function queueUpdate(docId, patch, doUpdate) {
  if (!pendingPatch[docId]) pendingPatch[docId] = {};
  for (var k in patch) pendingPatch[docId][k] = patch[k];

  clearTimeout(pendingTimer[docId]);
  pendingTimer[docId] = setTimeout(function () {
    var data = pendingPatch[docId];
    delete pendingPatch[docId];
    delete pendingTimer[docId];
    doUpdate(docId, data); // 真正发一次 update
  }, UPDATE_DELAY);
}

Page({
  data: {
    groupId: '',
    list: []
  },
  _unwatch: null,

  onLoad: function () {
    var gid = wx.getStorageSync('groupId') || ''
    if (!gid) {
      this.goGroups() // 没有分组，直接引导到分组管理页
    } else {
      this.setData({ groupId: gid })
      this.startWatch()
    }
  },

  onShow: function () {
    // 从分组管理页返回后，如分组有变化，重启监听
    var gid = wx.getStorageSync('groupId') || ''
    if (gid !== this.data.groupId) {
      this.setData({ groupId: gid, list: [] })
      if (gid) this.startWatch(); else this.stopWatch()
    }
  },

  onUnload: function () { this.stopWatch() },

  /* —— 实时监听 —— */
  startWatch: function () {
    this.stopWatch()
    if (!this.data.groupId) return
    var that = this
    this._unwatch = db.collection('songs')
      .where({ groupId: this.data.groupId })
      .orderBy('order', 'asc')
      .watch({
        onChange: function (snapshot) {
          var docs = snapshot.docs || []
          var list = []
          for (var i = 0; i < docs.length; i++) {
            var it = docs[i]
            var x = {
              _id: it._id,
              groupId: it.groupId || that.data.groupId,
              title: it.title || '',
              artist: it.artist || '',
              dancer: it.dancer || '',
              time: it.time || '',
              link: it.link || '',
              order: typeof it.order === 'number' ? it.order : i
            }
            x._color = colorFor(x.dancer)
            list.push(x)
          }
          that.setData({ list: list })
        },
        onError: function (err) {
          console.error('watch error', err)
          wx.showToast({ title: '实时连接异常', icon: 'none' })
        }
      })
  },

  stopWatch: function () {
    if (this._unwatch && typeof this._unwatch.close === 'function') {
      this._unwatch.close()
      this._unwatch = null
    }
  },

  /* —— 分组管理入口 —— */
  goGroups: function () {
    wx.navigateTo({ url: '/pages/groups/index' })
  },

  /* —— CRUD —— */
  addRow: function () {
    if (!this.data.groupId) {
      // 没有分组时，引导去分组管理页，而不是调用不存在的 changeGroup
      this.goGroups()
      return
    }
    var lastOrder = this.data.list.length ? (this.data.list[this.data.list.length - 1].order || 0) : 0
    db.collection('songs').add({
      data: {
        groupId: this.data.groupId,
        title: '', artist: '', dancer: '',
        time: nowHM(), link: '',
        order: lastOrder + 1
      }
    })
  },

  removeRow: function (e) {
    var idx = e.currentTarget.dataset.index
    if (idx < 0 || idx >= this.data.list.length) return
    var id = this.data.list[idx]._id
    db.collection('songs').doc(id).remove()
  },

  moveUp: function (e) {
    var i = e.currentTarget.dataset.index
    if (i <= 0) return
    this.swapOrder(i, i - 1)
  },

  moveDown: function (e) {
    var i = e.currentTarget.dataset.index
    if (i >= this.data.list.length - 1) return
    this.swapOrder(i, i + 1)
  },

  swapOrder: function (i, j) {
    var a = this.data.list[i], b = this.data.list[j]
    var col = db.collection('songs')
    col.doc(a._id).update({ data: { order: b.order } })
    col.doc(b._id).update({ data: { order: a.order } })
  },

  // 输入：本地立即更新 + 延迟合并写库（不卡）
  onEdit: function (e) {
    var i = e.currentTarget.dataset.index
    var field = e.currentTarget.dataset.field
    var value = (e.detail && typeof e.detail.value !== 'undefined') ? e.detail.value : ''
    if (i < 0 || i >= this.data.list.length) return

    // 本地立即更新
    var list = this.data.list.slice()
    var item = list[i]
    item[field] = value
    if (field === 'dancer') item._color = colorFor(value)
    this.setData({ list: list })

    // 合并写库
    var id = item._id
    var patch = {}; patch[field] = value
    queueUpdate(id, patch, function (docId, data) {
      db.collection('songs').doc(docId).update({ data: data })
    })
  },

  onTimeChange: function (e) {
    var i = e.currentTarget.dataset.index
    var value = (e.detail && e.detail.value) ? e.detail.value : ''
    if (i < 0 || i >= this.data.list.length) return

    var list = this.data.list.slice()
    var item = list[i]
    item.time = value
    this.setData({ list: list })

    var id = item._id
    queueUpdate(id, { time: value }, function (docId, data) {
      db.collection('songs').doc(docId).update({ data: data })
    })
  },

  goStats: function () {
    if (!this.data.groupId) { this.goGroups(); return }
    wx.navigateTo({ url: '/pages/stats/index?groupId=' + encodeURIComponent(this.data.groupId) })
  }
})
