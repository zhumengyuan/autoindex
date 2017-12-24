import * as rxme from 'rxme';
import { RxExpressMatcher } from './rx-express';
import { Response } from 'express-serve-static-core';

function loopGetObject(rapp: rxme.Subject,  s3: AWS.S3, config: any, mypath: string, res: Response, ofs = 0): void {
  const bufSize = 1024 * 1024;
  const lof = Object.assign({
    Key: mypath,
    Range: `bytes=${ofs}-${ofs + bufSize - 1}`
  }, config.s3);
  rapp.next(rxme.LogDebug(`s3.getObject:Request:`, lof));
  s3.getObject(lof, (err, data) => {
    if (err) {
      res.status(err.statusCode);
      res.end();
      return;
    } else {
      res.status(200);
    }
    rapp.next(rxme.LogDebug(`s3.getObject:Request:data:`, data));
    if (ofs == 0) {
      // bytes 229638144-230686719/584544256
      const len = data.ContentRange.split('/').slice(-1)[0] || ('' + data.ContentLength);
      const headers: { [s: string]: string; } = {
        'Content-Length': len,
        'Last-Modified': data.LastModified.toUTCString(),
        'Expiration': data.Expiration,
        'Etag': data.ETag,
        'Content-Encoding': data.ContentEncoding,
        'Content-Type': data.ContentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Host,Content-*',
        'Access-Control-Max-Age': '3000'
      };
      for (let k in headers) {
        if (headers[k]) {
          res.set(k, headers[k]);
        }
      }
    }
    res.write(data.Body);
    if (data.ContentLength < bufSize) {
      res.end();
    } else {
      loopGetObject(rapp, s3, config, mypath, res, ofs + bufSize);
    }
  });
}

export default function fileMatcher(rapp: rxme.Subject, s3: AWS.S3, config: any): rxme.MatcherCallback {
  return RxExpressMatcher((remw, sub) => {
    let mypath = remw.req.path;
    if (mypath.endsWith('/')) {
      // is a not a file
      return;
    }
    if (mypath.startsWith('/')) {
      mypath = mypath.substr(1);
    }
    rapp.next(rxme.LogInfo('fileMatcher:', mypath));
    loopGetObject(rapp, s3, config, mypath, remw.res);
  });
}
