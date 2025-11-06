var cloudReady = false
try { cloudReady = !!wx.cloud } catch (e) { cloudReady = false }

var db = null
if (cloudReady) {
  try { db = wx.cloud.database() } catch (e) { db = null }
}

Page({
  data: {
    cloudReady: cloudReady && !!db,
    groups: [],
    curGroup: '',
    errMsg: ''
  },

  onLoad: function () {
    var g = wx.getStorageSync('groupId') || ''
    this.setData({ curGroup: g })
    if (!this.data.cloudReady) {
      this.setData({ errMsg: 'cloud 未初始化或基础库过低' })
      return
    }
    this.refresh()
  },

  // 重新获取分组列表
  refresh: function () {
    var that = this
    if (!this.data.cloudReady) {
      this.setData({ errMsg: 'cloud 未初始化' })
      return
    }
    this.setData({ errMsg: '' })

    // 容错：如果没有 createdAt 字段也能取到（去掉排序；需要排序再打开下一行）
    db.collection('groups')
      // .orderBy('createdAt', 'desc')
      .get({
        success: function (res) {
          var arr = res.data || []
          // 补字段并做一个前端排序：createdAt desc, name asc
          for (var i = 0; i < arr.length; i++) {
            arr[i].name = arr[i].name || ''
            arr[i].createdAt = arr[i].createdAt || 0
          }
          arr.sort(function(a,b){
            if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt
            return a.name.localeCompare(b.name)
          })
          that.setData({ groups: arr, errMsg: '' })
        },
        fail: function (e) {
          console.error('groups.get fail:', e)
          var msg = (e && (e.errMsg || e.message)) ? (e.errMsg || e.message) : '未知错误'
          // 常见：permission denied（请设置分组集合权限为“所有用户可读写(开发期)”）
          that.setData({ errMsg: msg })
          wx.showToast({ title: '加载失败', icon: 'none' })
        }
      })
  },

  // 新建分组
  createGroup: function () {
    var that = this
    if (!this.data.cloudReady) {
      wx.showToast({ title: 'cloud 未初始化', icon: 'none' })
      return
    }
    wx.showModal({
      title: '新建分组',
      content: '请输入分组名（同组用户将共享列表）',
      editable: true,
      success: function (res) {
        if (!res.confirm) return
        var name = (res.content || '').trim()
        if (!name) return

        // 先查重名
        db.collection('groups').where({ name: name }).get({
          success: function (r) {
            if (r.data && r.data.length) {
              wx.showToast({ title: '该分组已存在', icon: 'none' })
              return
            }
            // 写入，若无集合会自动创建（需权限允许）
            db.collection('groups').add({
              data: { name: name, createdAt: Date.now(), ownerOpenid: '' }
            }).then(function () {
              wx.setStorageSync('groupId', name)
              that.setData({ curGroup: name })
              that.refresh()
              wx.showToast({ title: '已创建并切换', icon: 'success' })
            }).catch(function (e2) {
              console.error('groups.add fail:', e2)
              wx.showToast({ title: '创建失败', icon: 'none' })
            })
          },
          fail: function (e1) {
            console.error('groups.where.get fail:', e1)
            wx.showToast({ title: '校验失败', icon: 'none' })
          }
        })
      }
    })
  },

  // 切换分组
  switchGroup: function (e) {
    var name = e.currentTarget.dataset.name
    if (!name) return
    wx.setStorageSync('groupId', name)
    this.setData({ curGroup: name })
    wx.showToast({ title: '已切换', icon: 'success' })
    setTimeout(function(){ wx.navigateBack({ delta: 1 }) }, 300)
  },

  // 删除分组（可选清空歌曲）
  deleteGroup: function (e) {
    var id = e.currentTarget.dataset.id
    var name = e.currentTarget.dataset.name
    var that = this
    if (!id || !name) return

    wx.showModal({
      title: '删除分组',
      content: '是否删除分组「' + name + '」？（可选是否同时清空该分组的歌曲）',
      confirmText: '删分组',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return

        // 删 groups 文档
        db.collection('groups').doc(id).remove({
          success: function () {
            var cur = wx.getStorageSync('groupId') || ''
            if (cur === name) {
              wx.removeStorageSync('groupId')
              that.setData({ curGroup: '' })
            }
            that.refresh()

            // 询问是否清空该分组歌曲
            wx.showModal({
              title: '清空歌曲？',
              content: '是否同时清空该分组下的所有歌曲？',
              confirmText: '清空',
              cancelText: '保留',
              success: function (r2) {
                if (!r2.confirm) {
                  wx.showToast({ title: '分组已删', icon: 'success' })
                  return
                }
                that._removeSongsByGroup(name, function () {
                  wx.showToast({ title: '分组与歌曲已清空', icon: 'success' })
                })
              }
            })
          },
          fail: function (e1) {
            console.error('groups.remove fail:', e1)
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        })
      }
    })
  },

  // 批量删除某 group 的 songs（简易客户端版）
  _removeSongsByGroup: function (groupId, done) {
    function loop() {
      db.collection('songs').where({ groupId: groupId }).limit(100).get({
        success: function (res) {
          var arr = res.data || []
          if (!arr.length) { if (done) done(); return }
          var ps = []
          for (var i = 0; i < arr.length; i++) {
            ps.push(db.collection('songs').doc(arr[i]._id).remove())
          }
          Promise.all(ps).then(function () { loop() })
        },
        fail: function (e) {
          console.error('songs batch get fail:', e)
          if (done) done()
        }
      })
    }
    loop()
  }
})
