'use strict'

const EventEmitter = require('events');
const fs = require("fs");
const fetch = require("./fetchTimeout");
const CombinedStream = require('combined-stream');

class HugeDownloader {

    constructor(params) {
        this.endpoint = params.endpoint;
        this.file = params.file;
        this.target = params.target;
        this.chunkSize = params.chunkSize || 10;
        this.chunkSizeBytes = this.chunkSize * 1024 * 1024;
        this.chunkTimeout = params.chunkTimeout || (600*1000);
        this.chunkCount = 0;
        this.chunksSent = 0;
        this.verbose = !!params.verbose;

        this._validateParams();

        this._eventTarget = new EventEmitter();
        this._startDownloading();
    }

    /**
     * Custom logger
     */
     log() {
        if(!this.verbose) return;
        const args = Array.from(arguments);
        console.log.apply(this,args);
    }

    /**
     * Subscribe to an event
     */
    on(eType, fn) {
        this._eventTarget.on(eType, fn);
    }

    /**
     * Validate params and throw error if not of the right type
     */
    _validateParams() {
        if (!this.endpoint || !this.endpoint.length) throw new TypeError('endpoint must be defined');
        if (typeof this.file !== 'string') throw new TypeError('file must be a string');
        if (typeof this.target !== 'string') throw new TypeError('target must be a string');
        if (this.chunkSize && (typeof this.chunkSize !== 'number' || this.chunkSize === 0)) throw new TypeError('chunkSize must be a positive number');
    }

    _getMeta() {
        return fetch(`${this.endpoint}?file=${this.file}&meta=true&chunkSize=${this.chunkSizeBytes}`)
        .then(res=>res.json())
        .then(meta=>{
            this.totalChunks = meta.totalChunks;
            this.totalSize = meta.stats.size;
        });
    }

    async _getChunk() {
        const currentChunk = this.chunkCount;
        this.stream.append(async next=>{
            this.log("Downloading chunk",currentChunk,"of",this.totalChunks-1,"...");

            const res = await fetch(`${this.endpoint}?file=${this.file}&chunkSize=${this.chunkSizeBytes}&chunk=${currentChunk}`, {
                timeout: this.chunkTimeout
            });
            this.log("Received res for chunk",currentChunk,"res.ok=",res.ok,"res.status=",res.status);

            if(!res.ok) {
                this.log("Error downloading chunk",currentChunk,res.ok,res.status,res.error);
                throw new Error(`Initial error downloading file - ${res.error}`);
            }

            await new Promise((resolve,reject)=>{
                
                let timer = setTimeout(() => {
                    this.stream.close();
                    this.log("Timed out piping chunk to stream",currentChunk,"of",this.totalChunks);
                    reject({reason: 'Timed out piping chunk to stream', meta: {}});
                }, this.chunkTimeout);

                console.time(`Piping res.body to combined stream for chunk ${currentChunk}`);
                next(res.body);

                res.body.on('end',()=>{
                    clearTimeout(timer)
                    this.chunksSent++;

                    const percentProgress = Math.round((100 / this.totalChunks) * this.chunksSent);
                    this._eventTarget.emit('progress', percentProgress);

                    console.timeEnd(`Piping res.body to combined stream for chunk ${currentChunk}`);
                    this.log("Downloaded chunk",currentChunk,"of",this.totalChunks-1,"!");
                    resolve();
                });
                
            });
        });
    }

    async _getChunks() {
        for(this.chunkCount=0; this.chunkCount<this.totalChunks; this.chunkCount++) {
            await this._getChunk();
        }

        const fileStream = fs.createWriteStream(this.target);
        let timer;

        await new Promise((resolve, reject) => {
            const errorHandler = (error) => {
                clearTimeout(timer);
                reject({reason: 'Unable to download file', meta: {error}})
            };

            this.log("piping combined stream to file");
            console.time("combined stream to file");
            this.stream
                .on("error", errorHandler)
                .pipe(fileStream);

            
            fileStream
                .on('open', () => {
                    timer = setTimeout(() => {
                        fileStream.close()
                        reject({reason: 'Timed out writing to file', meta: {}})
                    }, this.chunkTimeout*this.chunkCount)
                })
                .on('error', errorHandler)
                .on("finish", ()=>{
                    clearTimeout(timer);
                    console.timeEnd("combined stream to file");
                    resolve();
                });
        });

        this._eventTarget.emit('finish');
    }

    _startDownloading() {
        this._getMeta()
        .then(()=>{
            this.stream = CombinedStream.create({ maxDataSize: this.totalSize });
            return this._getChunks()
        })
        .catch(err=>{
            this.log("huge downloader Error",err);
            this._eventTarget.emit('error', 'Failed starting to download chunks');
        })
    }
}

module.exports = HugeDownloader;