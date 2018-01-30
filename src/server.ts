// import * as express from 'express';
// var argv = require('minimist')(process.argv.slice(2));
// import * as path from 'path';
// import * as leftPad from 'left-pad';
import * as https from 'https';
import * as http from 'http';
import * as net from 'net';
import * as rxme from 'rxme';
// import { NextFunction, Response, Request } from 'express-serve-static-core';
// import { RxMe, MatcherCallback } from 'rxme';
// import { Endpoint } from 'aws-sdk/lib/endpoint';
// import { removeAllListeners } from 'cluster';
// import { RxExpress } from './rx-express';
// import * as leftPad from 'left-pad';
// import { Request } from 'aws-sdk/lib/request';
import * as simqle from 'simqle';
import QWorker from './q-worker';

import { RxHttp } from './rx-http';

import fileMatcher from './file-matcher';
import directoryMatcher from './directory-matcher';
import { parseConfig, Config } from './parse-config';
import * as AWSReal from 'aws-sdk';
import * as AWSMock from 'mock-aws-s3';

export type Server = http.Server | https.Server | net.Server;

export enum FileType {
  DIRECTORY = 'dir',
  FILE = 'file'
}

export class MyPath {
  public readonly name: string;
  public readonly fileType: FileType;

  constructor(name: string, fileType: FileType) {
    this.name = name;
    this.fileType = fileType;
  }

  public isDirectory(): boolean {
    return this.fileType == FileType.DIRECTORY;
  }
  public isFile(): boolean {
    return this.fileType == FileType.FILE;
  }

}

export function myPath(config: Config, url: string): MyPath {
  let mypath = url.replace(/\/+/g, '/');
  if (config.basepath && mypath.startsWith(config.basepath)) {
    mypath = mypath.substr(config.basepath.length);
    if (!mypath.startsWith('/')) {
      mypath = `/${mypath}`;
    }
  }
  // console.log(`directoryMatcher:${mypath}:${url}`);
  // rapp.next(rxme.LogInfo(`[${req.path}] [${mypath}]`));
  if (!mypath.endsWith('/')) {
    // not a directory
    return new MyPath(mypath, FileType.FILE);
  }
  if (mypath.startsWith('/')) {
    mypath = mypath.substr(1);
  }
  return new MyPath(mypath, FileType.DIRECTORY);
}

export function RxHttpMatcher(cb:
  (t: Server, sub?: rxme.Subject) => rxme.MatchReturn): rxme.MatcherCallback {
  return (rx, sub): rxme.MatchReturn => {
    if (rx.data instanceof net.Server ||
      rx.data instanceof http.Server ||
      rx.data instanceof https.Server) {
      return cb(rx.data, sub);
    }
  };
}

interface HttpHandler {
  (req: http.IncomingMessage, res: http.ServerResponse): void;
}

function RxMsgHttp(rapp: rxme.Subject): HttpHandler {
  return (rq, rs) => {
    rapp.next(RxHttp(rq, rs));
  };
}

export function server(argv: string[]): rxme.Observable {
  let runningServer: Server;
  let runningQueue: simqle.Queue;
  return rxme.Observable.create(rxo => {
    const config = parseConfig(argv);
    let s3: any;
    if (config.aws_module == 'aws') {
      rxo.next(rxme.Msg.LogInfo(`booting AWSReal:`, JSON.stringify(config)));
      s3 = new AWSReal.S3(config.aws);
    } else {
      rxo.next(rxme.Msg.LogInfo(`booting AWSMock:`, JSON.stringify(config)));
      s3 = new AWSMock.S3(config.aws);
    }
    rxo.next(rxme.Msg.Observer(rxo));
    const rapp = new rxme.Subject();
    simqle.start({ taskTimer: 60000 }).match(simqle.MatchQ(rq => {
      runningQueue = rq;
      Array(config.s3.Concurrent).fill(0).forEach(a => {
        rq.addWorker(QWorker);
      });
      rxo.next(rxme.Msg.LogInfo(`Started Q with ${config.s3.Concurrent} workers.`));
      rapp
        .match(directoryMatcher(rq, rapp, s3, config))
        .match(fileMatcher(rq, rapp, s3, config))
        .passTo(rxo);

      // app.use('/', (req, res, next) => { rapp.next(RxExpress(req, res, next)); });
      if (config.https) {
        const httpServer = https.createServer(config.https, RxMsgHttp(rapp));
        rxo.next(rxme.Msg.LogInfo(`Listen on: https ${config.port}`));
        httpServer.listen(config.port);
        rxo.next(rxme.Msg.Type(httpServer));
        runningServer = httpServer;
      } else {
        const httpServer = http.createServer(RxMsgHttp(rapp));
        rxo.next(rxme.Msg.LogInfo(`Listen on: http ${config.port}`));
        httpServer.listen(config.port);
        rxo.next(rxme.Msg.Type(httpServer));
        runningServer = httpServer;
      }
    })).passTo(rapp);
  }).match(rxme.Matcher.Complete(() => {
    console.log(`got complete`);
    runningQueue.stop().passTo();
    runningServer.close();
  }));
}

export default server;
