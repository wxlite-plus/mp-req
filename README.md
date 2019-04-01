# mp-req

mp-req是`wx.request`的高级封装，用于发起ajax请求。

`wx.request`是一个底层api，使用的不便之处在于：

1. 返回结果比较底层，需要处理statusCode，而开发者往往更关注业务相关的data部分；
2. 登录机制繁琐，设计上甚至有些反人类；
3. 不具备良好的接口管理功能，可维护性差；

……

综上所述，`wx.request`需要一层高级的封装来简化操作，因此有了`mp-req`（以下简称req），req代理了`wx.request`，并在这基础上做了一些设计工作，以提供良好的维护性：

* [promisify](#promisify)：支持promise，替代callback的方式；
* [简化respone](#简化respone)：简化返回的数据信息，只保留业务数据；
* [method替代url](#method替代url)：使用js api的书写方式来替代直接书写url的方式；
* [接口缓存](#接口缓存)：支持便捷的接口前端缓存；
* [自动登录](#自动登录)：登录态过期自动重新登录，过程对开发者透明。

## 下载与安装

[点击这里](https://github.com/wxlite-plus/mp-req/releases)下载`mp-req`的源码，将解压后的文件夹拷贝到小程序项目中的`utils`目录下，之后我们在项目根目录下创建文件夹`req`，新建文件`req/index.js`，引用`mp-req`并初始化：

```javascript
const req = require('../utils/mp-req/index.js');

req.init({
  // ...
});

module.exports = req;
```

如果你想要快速启动模板，对方表示没问题并向你扔了个[quick-start](https://github.com/jack-Lo/mp-req-quick-start)。

## 使用

我们先来简单演示一下用法，首先我们假定条件是这样的：

1. 我们有一个**获取用户数据**的接口：`https://api.jack-lo.com/mp-req/user/getInfo`；
2. 调用方式为`GET`，参数为`id`；

使用`wx.request`来调用是这样的：

```javascript
Page({
  onLoad() {
    this.getUserInfo('123');
  },
  getUserInfo(id) {
    wx.request({
      url: `https://api.jack-lo.com/mp-req/user/getInfo?id=${id}`,
      success(res) {
        console.log(res);
      },
    });
  },
});
```

接下来我们使用req来调用。

首先，我们分析接口：

1. 接口归类：获取用户信息应该属于`user`类；
2. 方法定义：获取信息，即`getInfo`；
3. 入参：接受一个字符串的`id`。

期望的效果大概是这样的：

```javascript
Page({
  onLoad() {
    this.getUserInfo('123');
  },
  getUserInfo(id) {
    req.user.getInfo({
      id,
    })
      .then((res) => {
        console.log(res);
      })
      .catch((err) => {
        console.log(err);
      });
  },
});
```

OK，我们在项目根目录下新建一个`req/api`目录用来存放api的定义文件，然后新建`user.js`文件，并做如下定义：

```javascript
// 定义类和方法
const user = {
  getInfo() {
    // your code
  },
};
```

接下来我们将以插件的方式实现一个install方法，这个方法负责将user这个类挂载到`req`上。

它接受两个参数`req`和`request`，req就是我们最终对外暴露的实例，而request则是对`wx.request`这一方法的封装：

```javascript
// 实现一个安装函数install
function install(req, request) {
  req.user = {
    getInfo(data) {
      const url = 'https://api.jack-lo.com/mp-req/user/getInfo/user/getInfo';
      return request({
        url,
        method: 'GET',
        data,
      });
    },
  };
}
```

request接受两个参数，一个是`options`，这个与`wx.request`的入参一致，第二参数是`keepLogin`，是否保持登录状态，默认为`true`，意思是发送请求的时候携带登录状态，如果登录失效，会自动走登录流程，再重新发起一次请求；如果设置`false`则不需要登录状态，也就是接口调用不关心用户是否登录。

定义好install之后，我们将其暴露以供外部调用：

```javascript
// 实现一个安装函数install
function install(req, request) {
  req.user = {
    getInfo(data) {
      const url = 'https://api.jack-lo.com/mp-req/user/getInfo/user/getInfo';
      return request({
        url,
        method: 'GET',
        data,
      });
    },
  };
}

module.exports = {
  install,
};
```

这样，我们就实现了一个接口的定义，接下来需要将这个插件安装到req上，新建文件`req/index.js`，使用`req.use`方法来接入插件：

```javascript
const req = require('./utils/mp-req/index.js');
const userApi = require('./api/user.js');

req.use(userApi);
```

就这样，我们完成了接口的定义，接下来我们在页面中使用：

```javascript
const { req } = require('../../req/index.js');

Page({
  onLoad() {
    this.getUserInfo('123');
  },
  getUserInfo(id) {
    req.user.getInfo({
      data: {
        id,
      },
      success(res) {
        console.log(res);
      },
    });
  },
});
```

以上，我们把一个url调用转换成了js api的调用，并且对接口进行的分类和抽象。

其实这里为了快速让大家认识req的使用，我们省略了req的初始化过程，所以上面的一波操作其实是不会work的。。。

这会儿我们再来了解一下req的初始化过程~

`req.init`接受以下参数：

* **apiUrl**：api地址的前缀，例如：`https://api.jack-lo.com/mp-req`；
* **code2sessionId**：code（来自于wx.login）转化为sessionId的过程函数；
* **isSessionAvailable**：sessionId是否有效（未过期）的判断函数。
* **sessionHeaderKey**：默认通过header的方式将sessionId传给后端，此项可以配置sessionId的key值。

先来看code2sessionId，我们首先需要通过`wx.login`获取到code，再通过`wx.request`将code传给后端，最后拿到后端返回的sessionId：

```javascript
function code2sessionId(code) {
  return new Promise((res, rej) => {
    wx.request({
      url: `https://api.jack-lo.com/mp-req/sys/login`,
      method: 'POST',
      data: {
        code,
      },
      success(r1) {
        if (r1.data && r1.data.code === 0) {
          res(r1.data.data.sessionId);
        } else {
          rej(r1);
        }
      },
      fail: rej,
    });
  });
}
```

> 注意，code2sessionId需要返回一个promise，并且最终resolve的是sessionId

再来看isSessionAvailable，假设当sessionId过期之后，后端都会返回`code=3000`，那么我们就需要统一处理这个状态，来让req重新发起一次登录过程，获取新的sessionId，再重新发送这次请求，所以isSessionAvailable的实现其实很简单：

```javascript
function isSessionAvailable(res) {
  return res.code !== 3000;
}
```

整理一下，我们回到`req/index.js`：

```javascript
const req = require('./utils/mp-req/index.js');
const userApi = require('./api/user.js');

const apiUrl = 'https://api.jack-lo.com/mp-req';

req.init({
  apiUrl,
  code2sessionId(code) {
    return new Promise((res, rej) => {
      wx.request({
        url: `${apiUrl}/sys/login`,
        method: 'POST',
        data: {
          code,
        },
        success(r1) {
          if (r1.data && r1.data.code === 0) {
            res(r1.data.data.sessionId);
          } else {
            rej(r1);
          }
        },
        fail: rej,
      });
    });
  },
  isSessionAvailable(res) {
    return res.code !== 3000;
  },
});

req.use(userApi);
```

由于初始化的时候我们传了apiUrl，之后的api定义我们就可以统一使用apiUrl来拼装url了，我们修改一下原来的`user.js`：

```javascript
// 实现一个安装函数install
function install(req, request) {
  req.user = {
    getInfo(data) {
      const url = `${req.apiUrl}/user/getInfo/user/getInfo`;
      return request({
        url,
        method: 'GET',
        data,
      });
    },
  };
}

module.exports = {
  install,
};
```

以上，就是定义一个接口的全部过程，当然，只是在第一次定义一个类的时候过程麻烦些，后续有属于`user`类的接口，只需要在`user.js`文件中补充对应的方法就可以了。

## promisify

涉及到ajax就避不开异步编程，谈到异步，怎么少得了**promise**，所以我们第一时间考虑将其promise化：

```javascript
req.user.getInfo({
  id: '123',
})
  .then((res) => {
    console.log(res);
  })
  .catch((err) => {
    console.log(err);
  });
```

## 简化respone

为了更加通用，`wx.request`的返回值包含了完整的`respone`内容，但在大部分情况下，开发者关注的只有`respone.data`部分，于是我们做了一层过滤，req的请求返回结果就是`respone.data`，至于异常的statusCode（指的是除了`(statusCode >= 200 && statusCode < 300) || statusCode === 304;`以外的情况），我们将它归为了`fail`的范畴，也就是promise的catch通道。

我们还是以上面的示例代码来介绍，`wx.request`返回的`res`结构为：

```json
{
  "data": {
    "name": "Jack",
    "age": 18,
    "gender": 1
  },
  "statusCode": 200,
  "header": {}
}
```

如果我们想要读取data的内容，首先要判断`statusCode`是否为“正常”的http状态码，也就是诸如200之类的，而如果是404，我们还得弹个窗报个错什么的：

```javascript
// url方式
wx.request({
  url: 'https://api.jack-lo.com/mp-req/user/getInfo?id=123',
  success(res) {
    if (res.statusCode === 200) {
      // 读取res.data
    } else {
      // 处理异常
    }
  },
  fail(err) {
    // 处理异常
  },
});
```

一般来说，我们的`res.data`里面还有业务层面的错误信息，这样的话，除了处理`wx.request`fail的错误，以及`success`里异常的`statusCode`错误，我们还要再处理业务逻辑的`res.data.code`（这里假设你的数据结构是`{code: number, data: any, msg: string}`）错误。。。

真是丧心病狂。。。

而`req.user.getInfo`返回的`res`则仅为：

```json
{
  "code": 0,
  "data": {
    "name": "Jack",
    "age": 18,
    "gender": 1
  },
  "msg": "success"
}
```

只关注业务部分的json，而fail和“bad statusCode”则一概交给catch通道去处理：

```javascript
// method方式
req.user.getInfo({
  id: '123',
})
  .then((res) => {
    console.log(res);
    if (res.code === 0) {
      // 请求成功
    } else {
      // 请求失败
    }
  })
  .catch((err) => {
    console.log(err);
  });
```

此时，err有可能是fail或者“bad statusCode”产生的，而这两种情况产生的err结构并不一样，如果你想弹窗显示错误信息，你可能需要对`err`进行识别和提炼，为此我们内置了两个方法`req.err.picker`和`req.err.show`，前者用于提炼错误信息文本，请放心，`req.err.picker`囊括了常见的error，能够很好地结合框架工作，而后者更方便，直接就是将error提炼并弹窗显示：

```javascript
req.user.getInfo({
  id: '123',
})
  .then((res) => {
    console.log(res);
    if (res.code === 0) {
      // 请求成功
    } else {
      // 请求失败
      req.err.show(res.msg);
    }
  })
  .catch((err) => {
    req.err.show(err); // 弹窗显示错误信息
    console.log(req.err.picker(res)); // 打印错误信息
  });
```

## method替代url

直接使用`wx.request`必然要面临手写url的问题，一方面书写不方便，另一方面难以维护。想象一下，一旦需要更换某个使用频率较高的接口，你可能要把每个调用的地方都修改一遍，而且由于url的拼接方式可能各不相同，使用find&replace功能可能会有纰漏。

```javascript
// url方式
wx.request({
  url: 'https://api.jack-lo.com/mp-req/user/getInfo?id=123',
});

// method方式
req.user.getInfo({
  id: '123',
});
```

我们将url转化为js api，这样的好处是方便调用和维护，同时，我们将接口做了一个归类，比如获取用户信息属于`user`类，将来`user`类也会继续添加其他一些接口，这样的接口更加的语义化，同时也起到命名空间的作用。

## 接口缓存

某些接口使用频率高但是变动又少，比如“获取当前用户的个人信息”、“获取省市区数据”，我们可以在前端通过缓存来提高性能，为此我们提供了如下几个api来控制接口缓存：

| api | 参数 | 返回值 | 示例 | 描述 |
| - | - | - | - | - |
| req.cachify | [string]req api | [function]cachifyFn | req.cachify('user.getMyInfo')() | 调用接口并缓存数据 |
| req.clearCache | [string]req api, [string]id(optional) | undefined | req.clearCache('user.getMyInfo') | 清除某个接口的缓存：接受两个参数，第一参数为`req api`名，第二参数为`id`（选填），也就是接口的唯一标识，这一般用在分页接口，默认可不填 |
| req.clearAllCache | [string]req api(optional) | undefined | req.clearAllCache('user.getMyInfo')() | 清除所有缓存：接受一个参数`req api`（选填），当传值时，清除指定api的缓存，不传则清除所有api的缓存 |

我们假设你已经定义好了 “**获取当前用户的个人信息**”这一接口`req.user.getMyInfo`，我们要对这一接口进行调用后缓存，那么调用方式应该为：

```javascript
req.cachify('user.getMyInfo')()
  .then((res) => {
    if (res.code === 0) {
      // res.data
    } else {
      req.err.show(res.msg);
    }
  })
  .catch((err) => {
    req.err.show(err);
  });
```

`req.cachify`接受的第一参数为一个**req api名**，并返回一个**函数**，这个函数入参同被定义的req api一致。

那么，什么时候清除缓存？当我**对我的个人信息进行编辑并提交成功**以后，我就需要清除缓存，以便获取最新的数据，假设已经定义好的“**更新我的信息接口**”为`req.user.updateMyInfo`：

```javascript
req.user.updateMyInfo()
  .then((res) => {
    if (res.code === 0) {
      req.clearCache('user.getMyInfo');
    } else {
      req.err.show(res.msg);
    }
  })
  .catch((err) => {
    req.err.show(err);
  });
```

> 注意：接口缓存是基于已定义接口的前提下，没有定义的接口是无法直接使用`req.cachify`调用的。

## 自动登录

按照官方文档，小程序的登录流程应该是这样的：

![登录流程](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/image/api-login.jpg?t=18122018)

简单来理解，**小程序登录其实就是一个用code换取session_key的过程**。

当session_key过期了，我重新用新code换取新的session_key，再去发请求。

那么，session_key过期我们怎么知道？有些开发者可能会用`wx.checkSession`去定时检查，但是定多长的时间呢？不知道，因为**微信不会把 session_key 的有效期告知开发者，而是根据用户使用小程序的行为对 session_key 进行续期，用户越频繁使用小程序，session_key 有效期越长**，因此，定时刷新是个不好的实践，因为你把握不了时机，会造成资源浪费并且增加不确定性。

事实上，**只有在需要跟微信（后端）接口打交道的时候，才需要有效的session_key**，那么后端肯定知道什么时候过期了，因为微信后端会告诉我们，所以我们把过期的判断交给后端，只要后端被告知过期了，接口就返回一个固定的状态，比如`code=3000`，前端收到这一状态之后，便重新走一遍登录流程，获取到新的`session_key`，再重新发起请求。

> 大多数时候我们只停留在自己的业务里，并不需要跟微信打交道，我们可以约定自己的会话有效期，并且放宽一些，比如1天，只要是不需要跟微信打交道，这个时效性就会宽松的多，性能也会得到提高。

req的自动登录就是这么实现的，约定好登录过期状态（默认是`res.code === 3000`，请根据实际情况自行修改），req会自动调用`wx.login`重新获取`js code`，再用`js code`去调用登录接口换取新的`sessionId`，最后再发起一遍上次的请求（通过header携带sessionId）。

这让开发者可以更加专注在业务开发上，而不必关心登录过期的问题。
