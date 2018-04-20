import qs from 'qs';
import axios from 'axios';


const extractUrl = function(url) {
  return url ? url.split('?')[0] : '';
}

const HTTP_METHODS = ['GET', 'DELETE', 'POST', 'PUT', 'PATCH'];
const POST_HTTP_METHODS = ['POST', 'PUT', 'PATCH'];

class Axee {

  constructor() {
    this.requestingApi = new Set();
    this.defaultParams = {
      repeatable: false,
      cancelable: false
    }
  }

  isRequesting(url) {
    const api = extractUrl(url);
    return this.requestingApi.has(api);
  }

  addRequest(url) {
    const api = extractUrl(url);
    this.requestingApi.add(api);
  }

  deleteRequest(url) {
    const api = extractUrl(url);
    this.requestingApi.delete(api);
  }

  request(params, extendparams) {
    extendparams = Object.assign({}, this.defaultParams, {
      repeatable: params.method.toUpperCase().indexOf(POST_HTTP_METHODS) == -1 //默认post类型的请求repeatable:false
    }, extendparams || {});

    let { url } = params;

    if (params.repeatable === false) {
      if (this.isRequesting(url)) {
        return new Promise(() => {});
      }
      this.addRequest(url);
    }

    let params = Utils.extend({ repeatable: false }, params, extendParam || {});
    params.crossDomain = params.url.indexOf('http') === 0;
    let { url } = params;
    if (!params.crossDomain) {
      let prefix = url.indexOf('/c/') != 0 ? '/biz' : '';
      url = `${this.PREFIX}${prefix}${params.url}`;
      params.url = url;
      // url = params.url = this.PREFIX + params.url;
    }
    if (params.method !== 'GET') {
      if (this.isRequesting(url)) {
        return new Promise(() => {});
      }
      if (params.repeatable === false) {
        this.addRequest(url);
      }
    }
    const header = {
      author: this.HEADER,
      channel: 'c',
      authorization: Utils.getCookie('_token')
    };
    const defaultParam = {
      headers: header,
      responseType: 'json',
      validateStatus() {
        return true;
      },
      paramsSerializer(p) {
        return qs.stringify(p, { allowDots: true, arrayFormat: 'repeat' });
      }
    };
    if (params.crossDomain) {
      defaultParam.headers = {};
    }
    const that = this;
    params = Utils.extend({}, defaultParam, params);
    if (params.isDownloadUrl) {
      params.responseType = 'blob';
    }
    params.url += `${params.url.indexOf('?') !== -1 ? '&' : '?'}_=${new Date().getTime()}`;
    return new Promise((resolve) => {
      tracer.scoped(() => {
        const method = params.method || 'GET';
        const zipkinParams = instrumentation.recordRequest(params, url, method);
        const traceId = tracer.id;
        axios.request(zipkinParams).then((response) => {
          that.deleteRequest(params.url);
          tracer.scoped(() => {
            instrumentation.recordResponse(traceId, response.status);
            let { status } = response;
            if (status == 200) {
              if (params.isDownloadUrl) {
                if (response.headers['content-type'] != "application/json") {
                  if (navigator.msSaveOrOpenBlob) {
                    navigator.msSaveOrOpenBlob(response.data, params.fileName || '');
                  } else {
                    let a = document.createElement('a');
                    a.href = window.URL.createObjectURL(response.data);
                    a.download = params.fileName || '';
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                  }
                  resolve({ ok: true });
                  return;
                }
                // HeyUI.$Message.error('下载失败');
                let reader = new FileReader();
                reader.onloadend = function () {
                  let result = {};
                  try {
                    result = JSON.parse(this.result);
                  } catch (error) {}
                  if (!params.customError) {
                    HeyUI.$Message.error(result.msg || '请求异常');
                  }
                  result.ok = false;
                  resolve(result);
                }
                reader.readAsText(response.data, 'UTF-8');
                return;
              }
            }
            const data = response.data || {};
            status = data.code == 1 ? 200 : data.code;
            if (status != 200) {
              if (status == 401) {
                if (window.location.pathname != '/') {
                  window.top.location = '/';
                }
                return;
              }
              if (status > 100 && G.get("stat")) {
                G.get("stat").error({
                  key: "api",
                  type: 2,
                  content: {
                    traceId,
                    url: params.url,
                    response: response.data,
                    requestData: params.data,
                    requestParams: params.params
                  }
                });
              }
              if (!params.noTip) {
                if (status == 500) {
                  HeyUI.$Message.error('后台异常');
                } else if (status == 404) {
                  HeyUI.$Message.error('请求不存在');
                } else if (status == 504) {
                  // HeyUI.$Message.error('请求超时');
                } else if (status != 200 && !params.customError) {
                  HeyUI.$Message.error(data.msg || '请求异常');
                }
              }
            }
            data.ok = data.code == 1;
            resolve(data);
          });
        }).catch((err) => {
          that.deleteRequest(params.url);
          tracer.scoped(() => {
            instrumentation.recordError(traceId, err);
          });
          resolve({
            ok: false
          });
        });
      })
    })
  }
}

for(let m of HTTP_METHODS) {
  Axee.prototype[m.toLowerCase()] = function(url, params, extendparams) {
    return this.request({url,method: m,data: params}, extendparams);
  }
}

for(let m of POST_HTTP_METHODS) {
  Axee.prototype[`${m.toLowerCase()}Form`] = function(url, params, extendparams) {
    let data = qs.stringify(params || {});
    return this.request({ url, method: m, data}, extendparams);
  }
}

module.exports = axee;