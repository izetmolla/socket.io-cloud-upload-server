# socket.io-cloud-upload-server 1.0
socket.io-cloud-upload-server allow to upload files and store file detail to database!


### Server side

```javascript

const SocketIOFileCloud = require("socket.io-cloud-upload-server")

import SocketIOFileCloud from "socket.io-cloud-upload-server"

io.on('connection', (socket) => {
	console.log('Socket connected.');

	var uploader = new SocketIOFileCloud(socket, {
		database: {
			cloud: query("select * from database"),  //from mysql query 
			member_id: socket.user_id //if you want to store user id 
		},
		// uploadDir: {			// multiple directories
		// 	music: 'data/music',
		// 	document: 'data/document'
		// },
		uploadDir: 'data',							// simple directory
		// accepts: ['audio/mpeg', 'audio/mp3'],		// chrome and some of browsers checking mp3 as 'audio/mp3', not 'audio/mpeg'
		// maxFileSize: 4194304, 						// 4 MB. default is undefined(no limit)
		chunkSize: 102400,							// default is 10240(1KB)
		transmissionDelay: 0,						// delay of each transmission, higher value saves more cpu resources, lower upload speed. default is 0(no delay)
		overwrite: false, 							// overwrite file if exists, default is true.
		rename: function (filename: any) {
			var split = filename.split('.');	// split filename by .(extension)
			var ext = split[split.length - 1];
			return `${Date.now()}.${ext}`;
		}
		// rename: 'MyMusic.mp3'
	})

	
	uploader.on('start', (fileInfo) => {
		console.log('Start uploading');
		console.log(fileInfo);
	});
	uploader.on('stream', (fileInfo) => {
		console.log(`${fileInfo.wrote} / ${fileInfo.size} byte(s)`);
	});
	uploader.on('complete', (fileInfo) => {
		console.log('Upload Complete.');
		console.log(fileInfo);
	});
	uploader.on('error', (err) => {
		console.log('Error!', err);
	});
	uploader.on('abort', (fileInfo) => {
		console.log('Aborted: ', fileInfo);
	});
});


```

## FAQ
### Upload 0 bytes
Try to upload after "ready" event fired.


## Browser Supports
This module uses FileReader API with ArrayBuffer, so make sure your browser support it.