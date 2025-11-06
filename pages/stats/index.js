const db = wx.cloud.database()

function colorFor(name) {
  var s = String(name || '未填写'), h = 0
  for (var i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) >>> 0
  h = h % 360
  return 'hsl(' + h + ', 70%, 88%)'
}

function aggregate(list) {
  var counts = {}, rows = []
  for (var i = 0; i < list.length; i++) {
    var it = list[i]
    var name = it && it.dancer ? String(it.dancer) : ''
    name = name.replace(/\u3000/g, ' ').trim().replace(/\s+/g, ' ')
    if (!name) name = '未填写'
    counts[name] = (counts[name] || 0) + 1
  }
  for (var k in counts) if (Object.prototype.hasOwnProperty.call(counts, k)) {
    rows.push({ name: k, count: counts[k], color: colorFor(k) })
  }
  rows.sort(function(a,b){ return b.count - a.count || a.name.localeCompare(b.name) })
  return { total: list.length, dancerCount: rows.length, rows: rows }
}

Page({
  data: { groupId: '', total: 0, dancerCount: 0, rows: [] },

  onLoad: function (q) {
    var gid = q && q.groupId ? decodeURIComponent(q.groupId) : (wx.getStorageSync('groupId') || '')
    this.setData({ groupId: gid })
    this.fetch()
  },

  fetch: function () {
    var that = this
    if (!this.data.groupId) {
      this.setData({ total:0, dancerCount:0, rows:[] })
      return
    }
    db.collection('songs').where({ groupId: this.data.groupId }).get({
      success: function (res) {
        that.setData(aggregate(res.data || []))
      },
      fail: function (e) {
        console.error(e)
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    })
  }
})
