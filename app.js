App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('基础库过低，需 2.2.3+')
      return
    }
    wx.cloud.init({
      env: 'cloud1-3gma5sgdd2f2f7c9' 
    })
  }
})
