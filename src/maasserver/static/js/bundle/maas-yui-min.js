!function(modules){var installedModules={};function __webpack_require__(moduleId){if(installedModules[moduleId])return installedModules[moduleId].exports;var module=installedModules[moduleId]={i:moduleId,l:!1,exports:{}};return modules[moduleId].call(module.exports,module,module.exports,__webpack_require__),module.l=!0,module.exports}__webpack_require__.m=modules,__webpack_require__.c=installedModules,__webpack_require__.d=function(exports,name,getter){__webpack_require__.o(exports,name)||Object.defineProperty(exports,name,{configurable:!1,enumerable:!0,get:getter})},__webpack_require__.r=function(exports){Object.defineProperty(exports,"__esModule",{value:!0})},__webpack_require__.n=function(module){var getter=module&&module.__esModule?function(){return module.default}:function(){return module};return __webpack_require__.d(getter,"a",getter),getter},__webpack_require__.o=function(object,property){return Object.prototype.hasOwnProperty.call(object,property)},__webpack_require__.p="",__webpack_require__(__webpack_require__.s=1)}({"./src/maasserver/static/js/yui/io.js":function(module,exports){YUI.add("maas.io",function(Y){Y.log("loading maas.io"),Y.namespace("maas.io").getIO=function(){var io=new Y.IO;return Y.io.header("X-CSRFTOKEN",Y.Cookie.get("csrftoken")),io}},"0.1",{requires:["cookie","io-base"]})},"./src/maasserver/static/js/yui/os_distro_select.js":function(module,exports){YUI.add("maas.os_distro_select",function(Y){Y.log("loading maas.os_distro_select");var _OSReleaseWidget,module=Y.namespace("maas.os_distro_select");module._io=new Y.maas.io.getIO,(_OSReleaseWidget=function(){_OSReleaseWidget.superclass.constructor.apply(this,arguments)}).NAME="os-release-widget",Y.extend(_OSReleaseWidget,Y.Widget,{initializer:function(cfg){this.initialSkip=!0},bindTo:function(osNode,event_name){var self=this;if(osNode){Y.one(osNode).on(event_name,function(e){var osValue=e.currentTarget.get("value");self.switchTo(osValue)});var osValue=Y.one(osNode).get("value");self.switchTo(osValue)}},switchTo:function(newOSValue){var options=this.get("srcNode").all("option"),selected=!1;options.each(function(option){var sel=this.modifyOption(option,newOSValue);!1===selected&&(selected=sel)},this),!0!==this.initialSkip?selected||this.selectVisableOption(options):this.initialSkip=!1},modifyOption:function(option,newOSValue){var selected=!1,value=option.get("value"),split_value=value.split("/");return""===newOSValue?""===value?(option.removeClass("hidden"),option.set("selected","selected")):option.addClass("hidden"):split_value[0]===newOSValue?(option.removeClass("hidden"),""!==split_value[1]||this.initialSkip||(selected=!0,option.set("selected","selected"))):option.addClass("hidden"),selected},selectVisableOption:function(options){var first_option=null;Y.Array.each(options,function(option){option.hasClass("hidden")||null===first_option&&(first_option=option)}),null!==first_option&&first_option.set("selected","selected")}}),module.OSReleaseWidget=_OSReleaseWidget},"0.1",{requires:["widget","maas.io"]}),YUI().use("maas.os_distro_select",function(Y){Y.on("load",function(){var releaseWidget=new Y.maas.os_distro_select.OSReleaseWidget({srcNode:"#id_deploy-default_distro_series"});releaseWidget.bindTo(Y.one("#id_deploy-default_osystem"),"change"),releaseWidget.render()})})},"./src/maasserver/static/js/yui/prefs.js":function(module,exports){YUI.add("maas.prefs",function(Y){Y.log("loading maas.prefs");var _TokenWidget,module=Y.namespace("maas.prefs");module._io=new Y.maas.io.getIO,(_TokenWidget=function(){_TokenWidget.superclass.constructor.apply(this,arguments)}).NAME="profile-widget",_TokenWidget.ATTRS={nb_tokens:{readOnly:!0,getter:function(){return this.get("srcNode").all(".js-bundle").size()}}},Y.extend(_TokenWidget,Y.Widget,{displayError:function(message){this.status_node.set("text",message)},initializer:function(cfg){this.create_link=Y.Node.create("<a />").set("href","#").set("id","create_token").addClass("p-button--neutral").addClass("u-float--right").set("text","Generate MAAS key"),this.status_node=Y.Node.create("<div />").set("id","create_error"),this.spinnerNode=Y.Node.create("<img />").addClass("u-animation--spin").addClass("icon").addClass("icon--loading"),this.get("srcNode").one("#token_creation_placeholder").append(this.create_link).append(this.status_node)},confirm:function(_confirm){function confirm(_x){return _confirm.apply(this,arguments)}return confirm.toString=function(){return _confirm.toString()},confirm}(function(message){return confirm(message)}),bindDeleteRow:function(row){var self=this;row.one("a.js-delete-link").on("click",function(e){e.preventDefault(),self.confirm("Are you sure you want to delete this key?")&&self.deleteToken(row)})},bindUI:function(){var self=this;this.create_link.on("click",function(e){e.preventDefault(),self.requestKeys()}),Y.each(this.get("srcNode").all(".js-bundle"),function(row){self.bindDeleteRow(row)})},deleteToken:function(row){var token_key=row.one("input").get("id"),self=this,cfg={method:"POST",data:Y.QueryString.stringify({op:"delete_authorisation_token",token_key:token_key}),sync:!1,on:{start:Y.bind(self.showSpinner,self),end:Y.bind(self.hideSpinner,self),success:function(id,out){row.remove()},failure:function(id,out){Y.log(out),404===out.status?self.displayError("The key has already been deleted."):self.displayError("Unable to delete the key.")}}};module._io.send(MAAS_config.uris.account_handler,cfg)},showSpinner:function(){this.displayError(""),this.status_node.insert(this.spinnerNode,"after")},hideSpinner:function(){this.spinnerNode.remove()},createTokenFromKeys:function(consumer_key,token_key,token_secret){return consumer_key+":"+token_key+":"+token_secret},addToken:function(token,token_key){var list=this.get("srcNode").one("ul"),row=Y.Node.create("<li />").addClass("js-bundle").addClass("u-equal-height").append(Y.Node.create("<div />").addClass("col-8").addClass("p-code-snippet").append(Y.Node.create("<input />").set("type","text").addClass("p-code-snippet__input").set("id",token_key).set("value",token))).append(Y.Node.create('<div class="col-1 u-vertically-center"><a class="p-tooltip p-tooltip--top-center js-delete-link"><i class="p-icon--delete"></i><span class="p-tooltip__message" role="tooltip">Delete API key</span></a></div>'));list.append(row),this.bindDeleteRow(row)},requestKeys:function(){var self=this,cfg={method:"POST",data:"op=create_authorisation_token",sync:!1,on:{start:Y.bind(self.showSpinner,self),end:Y.bind(self.hideSpinner,self),success:function(id,out){var keys;try{keys=JSON.parse(out.response)}catch(e){self.displayError("Unable to create a new token.")}var token=self.createTokenFromKeys(keys.consumer_key,keys.token_key,keys.token_secret);self.addToken(token,keys.token_key)},failure:function(id,out){self.displayError("Unable to create a new token.")}}};module._io.send(MAAS_config.uris.account_handler,cfg)}}),module.TokenWidget=_TokenWidget},"0.1",{requires:["widget","maas.io"]})},"./src/maasserver/static/js/yui/reveal.js":function(module,exports){YUI.add("maas.reveal",function(Y){Y.log("loading maas.reveal");var _Reveal,module=Y.namespace("maas.reveal");function get_style_int(node,attribute){return parseInt(node.getStyle(attribute),10)}(_Reveal=function(config){_Reveal.superclass.constructor.apply(this,arguments)}).NAME="reveal",_Reveal.ATTRS={targetNode:{value:null},linkNode:{value:null},hideText:{value:null},showText:{value:null},quick:{value:!1}},Y.extend(_Reveal,Y.Widget,{renderUI:function(){var target=this.get("targetNode");target.addClass("slider"),target.get("children").addClass("content")},bindUI:function(){var self=this;this.get("linkNode").on("click",function(e){e.preventDefault(),self.reveal()})},syncUI:function(){this.fire("hiding"),this.get("targetNode").setStyle("height",0),this.set_hidden_link(this.get("linkNode")),this.fire("hidden")},is_visible:function(){return get_style_int(this.get("targetNode"),"height")>0},set_hidden_link:function(link){var new_text=this.get("showText");null!==new_text&&void 0!==new_text&&link.set("text",new_text)},set_visible_link:function(link){var new_text=this.get("hideText");null!==new_text&&void 0!==new_text&&link.set("text",new_text)},get_animation_duration:function(suggested_duration){return this.get("quick")?.01:suggested_duration},create_slide_in:function(node,publisher){var anim=new Y.Anim({node:node,duration:this.get_animation_duration(.3),to:{height:0}});return anim.on("end",function(){publisher.fire("hidden")}),anim},create_slide_out:function(node,publisher){var content_node=node.one(".content"),new_height=get_style_int(content_node,"height")+get_style_int(content_node,"paddingTop")+get_style_int(content_node,"paddingBottom")+get_style_int(content_node,"marginTop")+get_style_int(content_node,"marginBottom"),anim=new Y.Anim({node:node,duration:this.get_animation_duration(.2),to:{height:new_height}});return anim.on("end",function(){publisher.fire("revealed")}),anim},reveal:function(){var target=this.get("targetNode"),link=this.get("linkNode");this.is_visible()?(this.fire("hiding"),this.create_slide_in(target,this).run(),this.set_hidden_link(link)):(this.fire("revealing"),this.create_slide_out(target,this).run(),this.set_visible_link(link))}}),module.Reveal=_Reveal},"0.1",{requires:["widget","node","event","anim"]}),YUI().use("maas.reveal",function(Y){Y.on("domready",function(){Y.all(".p-script-expander").each(function(script_entry){new Y.maas.reveal.Reveal({targetNode:script_entry.one(".p-script-expander__content"),linkNode:script_entry.one(".p-script-expander__trigger")}).render()})})})},"./src/maasserver/static/js/yui/shortpoll.js":function(module,exports){YUI.add("maas.shortpoll",function(Y){var namespace=Y.namespace("maas.shortpoll");function ShortPollManager(config){ShortPollManager.superclass.constructor.apply(this,arguments)}namespace.shortpoll_start_event="maas.shortpoll.start",namespace.shortpoll_fail_event="maas.shortpoll.failure",namespace.MAX_SHORT_DELAY_FAILED_ATTEMPTS=5,namespace.SHORT_DELAY=15e3,namespace.LONG_DELAY=18e4,namespace._repoll=!0,namespace._io=new Y.maas.io.getIO,ShortPollManager.NAME="shortPollManager",ShortPollManager.ATTRS={uri:{value:""},eventKey:{valueFn:function(){return Y.guid("shortpoll_")}},io:{readOnly:!0,getter:function(){return namespace._io}}},Y.extend(ShortPollManager,Y.Base,{initializer:function(cfg){this._started=!1,this._failed_attempts=0,this._sequence=0},successPoll:function(id,response){try{var eventKey=this.get("eventKey"),data=Y.JSON.parse(response.responseText);return Y.fire(eventKey,data),!0}catch(e){return Y.fire(namespace.shortpoll_fail_event,e),!1}},failurePoll:function(){Y.fire(namespace.shortpoll_fail_event)},_pollDelay:function(){return this._failed_attempts>=namespace.MAX_SHORT_DELAY_FAILED_ATTEMPTS?namespace.LONG_DELAY:namespace.SHORT_DELAY},repoll:function(failed){if(failed?this._failed_attempts+=1:this._failed_attempts=0,namespace._repoll){var delay=this._pollDelay();return Y.later(delay,this,this.poll),delay}return this._pollDelay()},poll:function(){var that=this,config={method:"GET",sync:!1,on:{failure:function(id,response){Y.Lang.isValue(response)&&Y.Lang.isValue(response.status)&&(408===response.status||504===response.status)?that.repoll(!1):(that.failurePoll(),that.repoll(!0))},success:function(id,response){var success=that.successPoll(id,response);that.repoll(!success)}}};this._sequence=this._sequence+1;var poll_uri=this.get("uri");poll_uri.indexOf("?")>=0?poll_uri+="&sequence="+this._sequence:poll_uri+="?sequence="+this._sequence,this._started||(Y.fire(namespace.shortpoll_start_event),this._started=!0),this.get("io").send(poll_uri,config)}}),namespace.ShortPollManager=ShortPollManager},"0.1",{requires:["base","event","json","maas.io"]})},1:function(module,exports,__webpack_require__){__webpack_require__("./src/maasserver/static/js/yui/io.js"),__webpack_require__("./src/maasserver/static/js/yui/os_distro_select.js"),__webpack_require__("./src/maasserver/static/js/yui/prefs.js"),__webpack_require__("./src/maasserver/static/js/yui/reveal.js"),module.exports=__webpack_require__("./src/maasserver/static/js/yui/shortpoll.js")}});
//# sourceMappingURL=maas-yui-min.js.map