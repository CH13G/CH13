var http = require('http'),
	url = require('url'),
	superagent = require('superagent'),
	cheerio = require('cheerio'),
	async = require('async'),
	fs = require('fs'),
	mkdirp = require('mkdirp'),
	eventproxy = require('eventproxy');
//控制并发，定义变量
var ep = new eventproxy();

var catchFirstUrl = 'http://www.cnblogs.com/',	//入口页面
	deleteRepeat = {}, //存放去重hsah
	urlArr = [], //存放爬取的网址
	catchData = [], //存放爬取的数据
	pageUrls = [], //存放每页文章的网址
	pageNum = 200, //要爬取的总页数
	startTime = new Date(),//开始时间
	endTime = false; //结束时间
//目录
//存到本地目录
var dir = './info/';
mkdirp(dir,function (err){
	if(err){
		console.log(err);
	}
});



//得到每一页网址，push进数组
(function (){
	var i = 1;
	while(i<=200){
		var pageUrl = 'http://www.cnblogs.com/?CategoryId=808&CategoryType=%22SiteHome%22&ItemListActionName=%22PostList%22&PageIndex='+ i +'&ParentCategoryId=0';
		i++;
		pageUrls.push(pageUrl);
	}

})()
//抓取邮箱、昵称、入园年龄、粉丝数量、关注数、【推荐】
function personInfo(url){
	var infoJson = {};
	superagent.get(url)
		.end(function(err,res){
			if(err){
				return console.log(err);
			}
			/**
			 * 类jq化，操作分析dom
			 * json内容
			 * title ,email,'昵称','圆龄','粉丝','关注','推荐'
			 */
			var $ = cheerio.load(res.text),
				$info = $('#profile_block a'),
				arr = ['昵称','圆龄','粉丝','关注','推荐'];
			//组建json	
			infoJson.title = $('#topics .postTitle a').text();
			infoJson.email = $('#blog-news>p').text();
			$info.each(function(idx,ele){
				infoJson[arr[idx]] = $(ele).text();
			})
			//把个人的所有信息push到catchData
			catchData.push(infoJson);
			fs.appendFile(dir+'12.txt',JSON.stringify(infoJson)+'\n','utf8');
		})
}

// 判断作者是否重复
function isAuthorRepeat(authorName){
	if(deleteRepeat[authorName] === undefined){
		deleteRepeat[authorName] = true;
		return false;
	}else if(deleteRepeat[authorName] == true){
		return true;
	}
}
//主程序start
function start(){
	function onRequest(req,resopne){
		resopne.writeHead(200, {'Content-Type': 'text/html;charset=utf-8'});
		// 当所有 'BlogArticleHtml' 事件完成后的回调触发下面事件
		ep.after('BlogArticleHtml',pageUrls.length*20,function(articleUrls){

			// resopne.write(articleUrls.length+ '<hr />');
			//每一页的所有文章链接
			articleUrls.forEach(function(articleUrl,idx){
				//4000个文章的链接
				resopne.write(idx+'=>>'+articleUrl+"<br />");
			})

			//console.log('articleUrls.length is'+ articleUrls.length +',content is :'+articleUrls);
			//控制并发数
			var curCount = 0;
			function reptileMove(url,callback){
				//延时时间
				var delay = 300;
				curCount++;
				console.log('现在的并发数是【'+curCount+ '】 正在抓取的是=>>', url);

				superagent.get(url)
					.end(function(err,res){
						if(err){
							return console.log(err);
						}
						var $ = cheerio.load(res.text);
						//获取文章的title、id
						var title = $('title').text(),
							id = url.split('/p/')[1].split('.')[0],
							currentBlogApp = url.split('/p/')[0].split('/')[3];
						resopne.write('当前的文章title=>>'+ title+'【'+ id+'】<hr />');

						var flag = 	isAuthorRepeat(currentBlogApp);
						if(!flag){
							var appUrl = "http://www.cnblogs.com/mvc/blog/news.aspx?blogApp="+ currentBlogApp;
							personInfo(appUrl);
						}
					})
				setTimeout(function() {
			    	curCount--;
			    	callback(null,url +'Call back content');
			  	}, delay);	
			}
			
			/**
			 * 使用async控制异步抓取
			 * mapLimit(arr, limit, iterator, [callback])异步回调
			 */
			async.mapLimit(
				articleUrls,
				5,
				function(url,callback){
					reptileMove(url, callback);
				},
				function(err,res){
					endTime = new Date();
					console.log('####',catchData.length,res)
					console.log(catchData);
					var time = (endTime - startTime)/1000;
					console.log('总共用时=>>'+time);
					resopne.write('<hr /> 总共用时=>>'+ time + '<hr />');
				}
			)
		})
		// 轮询所有文章列表页
		pageUrls.forEach(function(pageUrl){
			superagent.get(pageUrl)
				.end(function(err,res){
					if(err) {
						return console.log(err);
					}
					var $ = cheerio.load(res.text),
			     		$curPageUrls = $('.titlelnk');
			     	$curPageUrls.each(function(index, el) {
			     		var articleUrl = $(el).attr('href');
			     		// resopne.write(articleUrl+ '<hr />');
			     		//push到文章网址的数组里
			     		urlArr.push(articleUrl);
			     		// 相当于一个计数器
			      		ep.emit('BlogArticleHtml', articleUrl);
			     	});
				})
		})
	}
	http.createServer(onRequest).listen(3000,function(){
		console.log('3000端口已启动')
	});
}

//启动程序
start()