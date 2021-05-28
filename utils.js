"use strict";
const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size')

function mkdirSyncRecursively(dir, mode) {
    try {
        var result = fs.mkdirSync(dir, mode);
    }
    catch (e) {
        if (e.code === 'ENOENT') {
            mkdirSyncRecursively(path.dirname(dir), mode);  // if does not exists, create all parents recursively
            mkdirSyncRecursively(dir, mode);   // retry
        }
    }
}

function createDirectoryIfNotExists(dir) {
    try {
        fs.accessSync(dir, fs.F_OK);
    }
    catch (e) {
        // create directory if not exists
        mkdirSyncRecursively(dir, '0755');
    }
}

function getFileDetails(mime, file) {
    console.log("MINE: ", mime.split("/")[0])
    if (mime.split("/")[0] === "image") {
        console.log("SIZES", sizeOf(file))
        return sizeOf(file)
    } else {
        return {}
    }
}

module.exports = {
    mkdirSyncRecursively: mkdirSyncRecursively,
    createDirectoryIfNotExists: createDirectoryIfNotExists,
    getFileDetails: getFileDetails,
};