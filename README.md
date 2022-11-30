# Huge Downloader

Implemented based on doing the reverse of the [https://github.com/Buzut/huge-uploader](huge-uploader) node module. 

`huge-downloader` is a node module designed to download large files in chunks and reassemble them into the original file once downloaded. It works with a companion module `huge-downloader-backend` which handles chunking the file on the backend.

HTTP and especially HTTP servers have limits and were not designed to transfer large files. In addition, network connection can be unreliable. No one wants an upload to fail after hours… Sometimes we even need to pause the upload, and HTTP doesn't allow that.

The best way to circumvent these issues is to chunk the file and send it in small pieces. If a chunk fails, no worries, it's small and fast to re-send it. Wanna pause? Ok, just start where you left off when ready.

That's what `huge-downloader` does. It:
* chunks the file in pieces of your chosen size (this occurs in `huge-downloader-backend`),
* retries to upload a given chunk when transfer failed,
* auto pauses transfer when device is offline and resumes it when back online,
* allows you to pause and resume the upload,
* obviously allows you to set custom headers and post parameters.

## Installation & usage
```javascript
npm install huge-downloader --save
```

```javascript
const HugeDownloader = require('huge-downloader');

// instantiate the module with a settings object
const downloader = new HugeDownloader({ 
    endpoint: 'http://where-to-retrieve-files.com/download/',
    file: '/path/to/file.ext',
    postParams: { anyArgs: 'we want to send' }
});

// subscribe to events
downloader.on('error', (err) => {
    console.error('Something bad happened', err);
});

downloader.on('progress', (progress) => {
    console.log(`The download is at ${progress}%`);
});

downloader.on('finish', () => {
    console.log('Download finished!');
});

```

### Constructor settings object
The constructor takes a settings object. Available options are:
* `endpoint { String }` – where to retrieve the chunks (__required__)
* `file { String }` – remote path to the file to be uploaded (__required__)
* `target { String }` - local path where file should be downloaded to (__required__)
* `headers { Object }` – custom headers to send with each request
* `postParams { Object }` – post parameters that __will be sent with the last chunk__
* `chunkSize { Number }` – size of each chunk in MB (default is 10MB)
* `verbose { Boolean}` - Enable verbose logging
* `chunkTimeout { Number }` - Optional timeout for each individual chunk upload (default is 1 hour)


#### `error`
Either server responds with an error code that isn't going to change.
Success response codes are `200`, `201`, `204`. All error codes apart from `408`, `502`, `503`, `504` are considered not susceptible to change with a retry.

Or there were too many retries already.
```javascript
uploader.on('error', err => console.log(err.detail)); // A string explaining the error
```

#### `progress`
```javascript
uploader.on('progress', progress => console.log(progress)); // Number between 0 and 100
```

#### `finish`

The finish event is triggered with the last response body attached.

```javascript
uploader.on('finish', () => console.log('🍾'));
```

## How to set up with the server
This module has a twin [Node.js module](https://github.com/kevinaird/huge-downlaoder-backend) to handle downloads with a Node.js server as a backend. 

