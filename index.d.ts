// TypeScript Version: 2.3

import { Socket } from 'socket.io';

export = SocketIOFileCloud;

declare class SocketIOFileCloud {
    constructor(socket: Socket, options: Options);
    on(event: string, cb: (fileInfo: FileInfo) => void): void;
}

interface Options {
    uploadDir: string | { [dirId: string]: string };
    maxFileSize?: number;
    accepts?: string[];
    chunkSize?: number;
    transmissionDelay?: number;
    overwrite?: boolean;
    rename?: (fileName: string, fileInfo: FileInfo) => string | string;
    resume?: boolean;
    database: any
}

interface FileInfo {
    name: string;
    size: number;
    path: string;
    wrote: number;
    uploadDir: string;
    data: any[];
    mime: string;
    estimated: number;
    uploadId: string;
    originalFileName: string;
    obj_toDb: any
}
