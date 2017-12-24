import * as express from 'express';
// var argv = require('minimist')(process.argv.slice(2));
// import * as path from 'path';
// import * as leftPad from 'left-pad';
import * as https from 'https';
import * as http from 'http';
import * as rxme from 'rxme';
// import { NextFunction, Response, Request } from 'express-serve-static-core';
// import { RxMe, MatcherCallback } from 'rxme';
// import { Endpoint } from 'aws-sdk/lib/endpoint';
// import { removeAllListeners } from 'cluster';
import { RxExpress } from './rx-express';
// import * as leftPad from 'left-pad';
// import { Request } from 'aws-sdk/lib/request';

import fileMatcher from './file-matcher';
import directoryMatcher from './directory-matcher';
import parseConfig from './parse-config';
import * as AWSReal from 'aws-sdk';
import * as AWSMock from 'mock-aws-s3';

export default function server(argv: string[]): http.Server | https.Server {
  const config = parseConfig(argv);
  // console.log(`Start:`, config);

  let s3;
  if (config.aws_module == 'aws') {
    console.log(`booting AWSReal`);
    s3 = new AWSReal.S3(config.aws);
  } else {
    s3 = new AWSMock.S3(config.aws);
    console.log(`booting AWSMock`, config);
  }
  const app = express();

  const rapp = new rxme.Subject();
  rapp
    .match(directoryMatcher(rapp, s3, config))
    .match(fileMatcher(rapp, s3, config))
    .match(rxme.Matcher.Log(log => {
      if (log.level != rxme.LogLevel.DEBUG) {
        console.log(log);
      }
    })).passTo();

  app.use('/', (req, res, next) => { rapp.next(RxExpress(req, res, next)); });

  let httpServer = null;
  if (config.https) {
    httpServer = https.createServer(config.https, app);
    console.log(`Listen on: https ${config.port}`);
  } else {
    httpServer = http.createServer(app);
    console.log(`Listen on: http ${config.port}`);
  }

  httpServer.listen(config.port);
  return httpServer;
}
