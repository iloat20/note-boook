// pages/chat/chat.js
Page({
  data: {
    date: '',
    messages: [],
    inputMessage: '',
    isRecording: false,
    summary: '',
    showEmojiPicker: false,
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '🥵', '🥶', '🤒', '🤕', '🤢'],
    recorderManager: null
  },
  
  onLoad(options) {
    this.setData({
      date: options.date,
      recorderManager: wx.getRecorderManager()
    })
    this.loadMessages()
    
    // 初始化录音管理器
    const recorderManager = this.data.recorderManager
    const that = this
    recorderManager.onStop((res) => {
      const tempFilePath = res.tempFilePath
      const newMessage = {
        id: Date.now(),
        sender: 'user',
        type: 'audio',
        content: tempFilePath,
        time: new Date().toLocaleTimeString()
      }
      const updatedMessages = [...that.data.messages, newMessage]
      that.setData({
        messages: updatedMessages,
        isRecording: false
      })
      that.saveMessages(updatedMessages)
      
      // 语音转文字
      wx.cloud.callFunction({
        name: 'translateVoice',
        data: {
          filePath: tempFilePath
        },
        success: function(res) {
          const textMessage = {
            id: Date.now(),
            sender: 'user',
            type: 'text',
            content: res.result,
            time: new Date().toLocaleTimeString()
          }
          const updatedMessagesWithText = [...that.data.messages, textMessage]
          that.setData({
            messages: updatedMessagesWithText
          })
          that.saveMessages(updatedMessagesWithText)
        },
        fail: function(res) {
          console.error('语音转文字失败:', res)
        }
      })
    })
    
    recorderManager.onError((res) => {
      console.error('录音失败:', res)
      this.setData({
        isRecording: false
      })
    })
  },
  
  loadMessages() {
    const savedMessages = wx.getStorageSync(`noteMessages_${this.data.date}`) || []
    const savedSummary = wx.getStorageSync(`noteSummary_${this.data.date}`) || ''
    this.setData({
      messages: savedMessages,
      summary: savedSummary
    })
  },
  
  goBack() {
    wx.navigateBack()
  },
  
  formatDate(dateString) {
    const date = new Date(dateString)
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
  },
  
  handleInput(e) {
    this.setData({
      inputMessage: e.detail.value
    })
  },
  
  sendMessage() {
    if (this.data.inputMessage.trim()) {
      const newMessage = {
        id: Date.now(),
        sender: 'user',
        type: 'text',
        content: this.data.inputMessage.trim(),
        time: new Date().toLocaleTimeString()
      }
      const updatedMessages = [...this.data.messages, newMessage]
      this.setData({
        messages: updatedMessages,
        inputMessage: ''
      })
      this.saveMessages(updatedMessages)
    }
  },
  
  saveMessages(messages) {
    wx.setStorageSync(`noteMessages_${this.data.date}`, messages)
    
    // 更新日期列表
    const savedDates = wx.getStorageSync('noteDates') || []
    if (!savedDates.includes(this.data.date)) {
      savedDates.push(this.data.date)
      wx.setStorageSync('noteDates', savedDates)
    }
  },
  
  toggleRecording() {
    if (!this.data.isRecording) {
      this.startRecording()
    } else {
      this.stopRecording()
    }
  },
  
  startRecording() {
    const recorderManager = this.data.recorderManager
    const options = {
      duration: 60000,
      sampleRate: 44100,
      numberOfChannels: 1,
      encodeBitRate: 192000,
      format: 'mp3',
      frameSize: 50
    }
    recorderManager.start(options)
    this.setData({
      isRecording: true
    })
  },
  
  stopRecording() {
    const recorderManager = this.data.recorderManager
    recorderManager.stop()
  },
  
  triggerFileUpload() {
    const that = this
    wx.showActionSheet({
      itemList: ['选择图片', '选择视频', '选择文件'],
      success: function(res) {
        if (res.tapIndex === 0) {
          // 选择图片
          wx.chooseImage({
            count: 9,
            sizeType: ['original', 'compressed'],
            sourceType: ['album', 'camera'],
            success: function(res) {
              const tempFilePaths = res.tempFilePaths
              const updatedMessages = [...that.data.messages]
              
              tempFilePaths.forEach(path => {
                const newMessage = {
                  id: Date.now(),
                  sender: 'user',
                  type: 'image',
                  content: path,
                  time: new Date().toLocaleTimeString()
                }
                updatedMessages.push(newMessage)
              })
              
              that.setData({
                messages: updatedMessages
              })
              that.saveMessages(updatedMessages)
            }
          })
        } else if (res.tapIndex === 1) {
          // 选择视频
          wx.chooseVideo({
            sourceType: ['album', 'camera'],
            maxDuration: 60,
            camera: 'back',
            success: function(res) {
              const newMessage = {
                id: Date.now(),
                sender: 'user',
                type: 'video',
                content: res.tempFilePath,
                time: new Date().toLocaleTimeString()
              }
              const updatedMessages = [...that.data.messages, newMessage]
              
              that.setData({
                messages: updatedMessages
              })
              that.saveMessages(updatedMessages)
            }
          })
        } else if (res.tapIndex === 2) {
          // 选择文件
          wx.chooseMessageFile({
            count: 9,
            type: 'all',
            success: function(res) {
              const tempFiles = res.tempFiles
              const updatedMessages = [...that.data.messages]
              
              tempFiles.forEach(file => {
                let messageType = 'file'
                if (file.type.startsWith('audio/')) {
                  messageType = 'audio'
                }
                
                const newMessage = {
                  id: Date.now(),
                  sender: 'user',
                  type: messageType,
                  content: file.path,
                  time: new Date().toLocaleTimeString()
                }
                updatedMessages.push(newMessage)
              })
              
              that.setData({
                messages: updatedMessages
              })
              that.saveMessages(updatedMessages)
            }
          })
        }
      }
    })
  },
  
  generateSummary() {
    const textMessages = this.data.messages
      .filter(msg => msg.type === 'text' && msg.sender === 'user')
      .map(msg => msg.content)
      .join(' ')
    
    if (textMessages) {
      // 模拟AI总结功能
      const summary = `今天你记录了以下内容：${textMessages.substring(0, 100)}...`
      this.setData({
        summary: summary
      })
      wx.setStorageSync(`noteSummary_${this.data.date}`, summary)
    }
  },
  
  toggleEmojiPicker() {
    this.setData({
      showEmojiPicker: !this.data.showEmojiPicker
    })
  },
  
  selectEmoji(e) {
    const emoji = e.currentTarget.dataset.emoji
    this.setData({
      inputMessage: this.data.inputMessage + emoji
    })
  },
  
  // 预览图片
  previewImage(e) {
    const current = e.currentTarget.dataset.src
    const images = this.data.messages
      .filter(msg => msg.type === 'image')
      .map(msg => msg.content)
    wx.previewImage({
      current: current,
      urls: images
    })
  },
  
  // 预览视频
  previewVideo(e) {
    const src = e.currentTarget.dataset.src
    wx.playVideo({
      src: src,
      showCenterPlayBtn: true,
      enableProgressGesture: true
    })
  }
})