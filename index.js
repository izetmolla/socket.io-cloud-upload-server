"use strict";
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const fs = require('fs');
const path = require('path');
const mime = require('mime');
const createDirectoryIfNotExists = require('./utils').createDirectoryIfNotExists;
const getFileDetails = require('./utils').getFileDetails;

function SocketIOFileCloud(socket, options) {
    if (!socket) {
        throw new Error('SocketIOFileCloud requires Socket.');
    }

    this.database = options.database ? options.database : {} || {};
    this.options = options || {};
    this.maxFileSize = +options.maxFileSize || undefined;
    this.accepts = options.accepts || [];
    this.chunkSize = +options.chunkSize || 10240;
    this.transmissionDelay = options.transmissionDelay || 0;
    this.overwrite = !!options.overwrite || false;
    this.rename = options.rename || null;
    this.resume = !!options.resume || false;

    if (!options.uploadDir) {
        throw new Error('No upload directory specified.');
    }

    // check directory is exists
    if (typeof options.uploadDir === 'string') {
        createDirectoryIfNotExists(options.uploadDir);
    }
    else if (typeof options.uploadDir === 'object') {
        for (var key in options.uploadDir) {
            createDirectoryIfNotExists(options.uploadDir[key]);
        }
    }
    else {
        throw new Error('options.uploadDir must be string or object array.');
    }

    this.socket = socket;

    socket.on('socket.io-cloud-upload-server::reqSync', () => {
        socket.emit('socket.io-cloud-upload-server::recvSync', {
            maxFileSize: this.maxFileSize,
            accepts: this.accepts,
            chunkSize: this.chunkSize,
            transmissionDelay: this.transmissionDelay
        });

        this.emit('ready');
    });

    var self = this;
    var uploadingFiles = {};

    socket.on('socket.io-cloud-upload-server::createFile', async (fileInfo) => {
        var id = fileInfo.id;
        var uploadDir = null;
        var uploadTo = fileInfo.uploadTo || '';
        var data = fileInfo.data || {};
        var filename = fileInfo.name;
        var originalFileName = fileInfo.name;
        var cloud_details = this.database.cloud ? await this.database.cloud : []



        function sendError(err) {
            socket.emit(`socket.io-cloud-upload-server::error::${id}`, {
                message: err.message
            });
            self.emit('error', err, {
                uploadId: id,
                name: filename,
                uploadTo: uploadTo,
                data: data
            });
        }

        if (this.rename) {
            if (typeof this.rename === 'function') {
                filename = this.rename(filename, fileInfo);
            }
            else {
                filename = this.rename;
            }
        }

        if (typeof options.uploadDir === 'string') {
            uploadDir = path.join(options.uploadDir, filename);
        }
        else if (typeof options.uploadDir === 'object') {
            if (!uploadTo) {
                return sendError(new Error('Upload directory must be specified in multiple directories.'));
            }
            else if (options.uploadDir[uploadTo]) {
                uploadDir = path.join(options.uploadDir[uploadTo], filename);
            }
            else {
                return sendError(new Error('Upload directory ' + uploadTo + ' is not exists.'));
            }
        }
        else if (fileInfo.size > this.maxFileSize) {
            return sendError(new Error('Max Uploading File size must be under ' + this.maxFileSize + ' byte(s).'));
        }

        var startTime = new Date();

        const emitObj = {
            name: filename,
            size: fileInfo.size,
            uploadDir: uploadDir,
            data: data,
            obj_toDb: cloud_details.length > 0 ? {
                cloud_id: cloud_details[0].id,
                filename,
                member_id: this.database.member_id ? this.database.member_id : null,
                // file_details: getFileDetails(mimeType, uploadDir)
                file_details: { new: true }
            } : {}
        };

        if (this.rename) {
            // rename setting
            // add origininalFileName to emitObj
            emitObj.originalFileName = originalFileName;
        }

        this.emit('start', emitObj);


        const uploadComplete = () => {
            const ws = uploadingFiles[id].writeStream;

            if (ws) {
                ws.end();
            }

            const endTime = new Date();

            const mimeType = mime.getType(uploadDir);
            const emitObj = {
                name: filename,
                size: uploadingFiles[id].size,
                wrote: uploadingFiles[id].wrote,
                uploadDir: uploadingFiles[id].uploadDir,
                data: uploadingFiles[id].data,
                mime: mimeType,
                estimated: endTime - startTime,
                uploadId: id,
                obj_toDb: {
                    cloud_id: cloud_details ? cloud_details[0].id : null,
                    file_created: Date.now(),
                    file_name: id + '_' + (this.database.member_id ? this.database.member_id + '_' : '') + filename,
                    member_id: this.database.member_id ? this.database.member_id : null,
                    file_details: getFileDetails(mimeType, uploadingFiles[id].uploadDir)
                }

            };

            if (this.rename) {
                // rename setting
                // add originalFileName to emitObj
                emitObj.originalFileName = originalFileName;
            }

            if (this.accepts && this.accepts.length > 0) {
                let found = false;

                for (var i = 0; i < this.accepts.length; i++) {
                    let accept = this.accepts[i];

                    if (mimeType === accept) {
                        found = true;
                        break;
                    }
                }

                // if mime is invalid, remove files and emit error
                if (!found) {
                    // console.log(uploadDir)
                    fs.unlink(uploadDir);	// no after works.

                    let err = new Error('Not Acceptable file type ' + mimeType + ' of ' + filename + '. Type must be one of these: ' + this.accepts.join(', '));
                    return sendError(err);
                }
                else {
                    self.socket.emit(`socket.io-cloud-upload-server::complete::${id}`, emitObj);
                    self.emit('complete', emitObj);
                }
            }
            else {
                self.socket.emit(`socket.io-cloud-upload-server::complete::${id}`, emitObj);
                self.emit('complete', emitObj);
            }

            // Release event handlers
            socket.removeAllListeners(`socket.io-cloud-upload-server::stream::${id}`);
            socket.removeAllListeners(`socket.io-cloud-upload-server::done::${id}`);
            socket.removeAllListeners(`socket.io-cloud-upload-server::complete::${id}`);
            socket.removeAllListeners(`socket.io-cloud-upload-server::abort::${id}`);
            socket.removeAllListeners(`socket.io-cloud-upload-server::error::${id}`);

            delete uploadingFiles[id];
        };

        uploadingFiles[id] = {
            writeStream: null,
            name: fileInfo.name,
            size: fileInfo.size,
            wrote: 0,
            uploadDir: uploadDir,
            data: data,
            resume: false,
        };

        // check if file exists
        const isFileExists = fs.existsSync(uploadDir);

        if (isFileExists) {
            const uploadedFileStats = fs.statSync(uploadDir);

            if (this.resume) {
                if (uploadingFiles[id].size > 0) {
                    if (uploadingFiles[id].size > uploadedFileStats.size) {
                        uploadingFiles[id].wrote = uploadedFileStats.size;
                        uploadingFiles[id].resume = true;
                        socket.emit(`socket.io-cloud-upload-server::resume::${id}`, uploadingFiles[id]);
                    } else {
                        if (!this.overwrite) return uploadComplete();
                    }
                }
            } else {
                if (!this.overwrite) return uploadComplete();
            }
        }

        if (!options.overwrite) {
            let isFileExists = false;

            try {
                fs.accessSync(uploadDir, fs.F_OK);
                isFileExists = true;
            }
            catch (e) {
                // console.log('File is not exists, so create new one.');
            }

            if (isFileExists) return uploadComplete();
        }

        var writeStream = fs.createWriteStream(uploadDir);

        uploadingFiles[id].writeStream = writeStream;

        socket.emit(`socket.io-cloud-upload-server::request::${id}`);

        socket.on(`socket.io-cloud-upload-server::stream::${id}`, (chunk) => {
            if (uploadingFiles[id].abort) {
                socket.removeAllListeners(`socket.io-cloud-upload-server::stream::${id}`);
                socket.removeAllListeners(`socket.io-cloud-upload-server::done::${id}`);
                socket.removeAllListeners(`socket.io-cloud-upload-server::complete::${id}`);
                socket.removeAllListeners(`socket.io-cloud-upload-server::abort::${id}`);
                socket.removeAllListeners(`socket.io-cloud-upload-server::error::${id}`);

                uploadingFiles[id].writeStream.end();
                delete uploadingFiles[id];
                return;
            }

            var writeStream = uploadingFiles[id].writeStream;

            function write() {
                let result = (uploadingFiles[id].wrote + chunk.length) > (self.maxFileSize);

                if ((uploadingFiles[id].wrote + chunk.length) > (self.maxFileSize)) {
                    return sendError(new Error(`Uploading file size exceeded max file size ${self.maxFileSize} byte(s).`));
                }

                var writeDone = writeStream.write(chunk);
                uploadingFiles[id].wrote += chunk.length;

                self.emit('stream', {
                    name: uploadingFiles[id].name,
                    size: uploadingFiles[id].size,
                    wrote: uploadingFiles[id].wrote,
                    uploadDir: uploadingFiles[id].uploadDir,
                    data: uploadingFiles[id].data,
                    uploadId: id
                });

                if (!writeDone) {
                    writeStream.once('drain', () => socket.emit(`socket.io-cloud-upload-server::request::${id}`));
                }
                else {
                    if (self.transmissionDelay) {
                        setTimeout(() => {
                            socket.emit(`socket.io-cloud-upload-server::request::${id}`);
                        }, self.transmissionDelay);
                    }
                    else {
                        socket.emit(`socket.io-cloud-upload-server::request::${id}`);
                    }
                }
            }

            write();
        });
        socket.on(`socket.io-cloud-upload-server::done::${id}`, () => {
            uploadComplete();
        });
        socket.on(`socket.io-cloud-upload-server::abort::${id}`, () => {
            uploadingFiles[id].abort = true;

            self.emit('abort', {
                name: uploadingFiles[id].name,
                size: uploadingFiles[id].size,
                wrote: uploadingFiles[id].wrote,
                uploadDir: uploadingFiles[id].uploadDir,
                data: uploadingFiles[id].data,
                uploadId: id
            });

            socket.emit(`socket.io-cloud-upload-server::abort::${id}`, {
                name: uploadingFiles[id].name,
                size: uploadingFiles[id].size,
                wrote: uploadingFiles[id].wrote,
                uploadDir: uploadingFiles[id].uploadDir
            });
        });
    });
}

SocketIOFileCloud.prototype.destroy = function () {
    this.emit('destroy');
    this.socket.emit('socket.io-cloud-upload-server::disconnectByServer');

    // Clear the resources
    this.removeAllListeners();
    this.socket = null;		// Remove reference of Socket.io
};
util.inherits(SocketIOFileCloud, EventEmitter);

module.exports = SocketIOFileCloud;
