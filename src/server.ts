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

import { RxHttp } from './rx-http';

import fileMatcher from './file-matcher';
import directoryMatcher from './directory-matcher';
import parseConfig from './parse-config';
import * as AWSReal from 'aws-sdk';
import * as AWSMock from 'mock-aws-s3';

export function RxHttpMatcher(cb:
  (t: http.Server | https.Server | net.Server, sub?: rxme.Subject) => rxme.MatchReturn): rxme.MatcherCallback {
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
  return rxme.Observable.create(rxo => {
    const config = parseConfig(argv);
    // console.log(`Start:`, config);

    let s3;
    if (config.aws_module == 'aws') {
      rxo.next(rxme.Msg.LogInfo(`booting AWSReal:`, config));
      s3 = new AWSReal.S3(config.aws);
    } else {
      rxo.next(rxme.Msg.LogInfo(`booting AWSMock:`, config));
      s3 = new AWSMock.S3(config.aws);
    }
    // const app = express();

    const rapp = new rxme.Subject();
    rapp
      .match(directoryMatcher(rapp, s3, config))
      .match(fileMatcher(rapp, s3, config))
      .passTo(rxo);

    // app.use('/', (req, res, next) => { rapp.next(RxExpress(req, res, next)); });
    if (config.https) {
      const httpServer = https.createServer(config.https, RxMsgHttp(rapp));
      rxo.next(rxme.Msg.LogInfo(`Listen on: https ${config.port}`));
      httpServer.listen(config.port);
      rxo.next(rxme.Msg.Type(httpServer));
    } else {
      const httpServer = http.createServer(RxMsgHttp(rapp));
      rxo.next(rxme.Msg.LogInfo(`Listen on: http ${config.port}`));
      httpServer.listen(config.port);
      rxo.next(rxme.Msg.Type(httpServer));
    }
  });
}

export default server;
