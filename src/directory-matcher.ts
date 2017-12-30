import * as rxme from 'rxme';
import { RxHttpMatcher } from './rx-http';
// import { Response, Request } from 'express-serve-static-core';
import { Response } from './rx-http';
import * as AWS from 'aws-sdk';
import * as simqle from 'simqle';

function loopListObjects(rq: simqle.Queue, s3: AWS.S3, config: any, mypath: string,
  listObjects: rxme.Subject, marker?: string): rxme.Observable {
  return rxme.Observable.create(obs => {
    const lo = {
      // EncodingType: 'url',
      Bucket: config.s3.Bucket,
      Delimiter: '/',
      Prefix: mypath,
      Marker: marker
    };
    listObjects.next(rxme.LogDebug(`s3.listObjects:Request:`, lo));
    s3.listObjects(lo, (error, data) => {
      if (error) {
        listObjects.next(rxme.LogError('AWS:', error));
        return;
      }
      listObjects.next(new rxme.RxMe(data));
      if (!data.IsTruncated) {
        listObjects.next(rxme.LogDebug(`s3.listObjects:Completed`));
        listObjects.complete();
        obs.complete();
      } else {
        obs.complete();
        rq.push(loopListObjects(rq, s3, config, mypath, listObjects, data.Contents[data.Contents.length - 1].Key),
          (new rxme.Subject()).passTo());
      }
    });
  });
}

function top(config: any, prefix: string): string {
  return `<html>
  <head>
    <title>Index of s3://${config.s3.Bucket}/${prefix}</title>
  </head>
  <body>
    <H1>Index of s3://${config.s3.Bucket}/${prefix}</H1>
    <HR>
    <pre>\n`;
}

function footer(): string {
  return `    </pre>
  </body>
</html>`;
}

interface Spaces {
  key: string;
  keyDotDot: string;
  spaces: string;
}

function spaces(key: string): Spaces {
  let spcs = '';
  let keyDotDot = key;
  if (key.length >= 50) {
    keyDotDot = key.slice(0, 47) + '..>';
  } else {
    spcs = Array(50 - key.length).fill(' ').join('');
  }
  return { key: key, keyDotDot: keyDotDot, spaces: spcs };
}

function leftPad(istr: any, len: number, ch: string): string {
  const str = '' + istr;
  if (str.length >= len) { return str; }
  return Array(len - str.length).fill(ch.slice(0, 1)).join('') + str;
}

function formatDate(a: Date): string {
  return [
    `${leftPad(a.getDate(), 2, '0')}-${leftPad(a.getMonth() + 1, 2, '0')}-${a.getFullYear()}`,
    `${leftPad(a.getHours(), 2, '0')}:${leftPad(a.getMinutes(), 2, '0')}`].join(' ');
}

function link(fname: string): string {
  const spcs = spaces(fname);
  return `<a href="${spcs.key}">${spcs.keyDotDot}</a>${spcs.spaces}`;
}

function resolvHeadObject(mypath: string, so: AWS.S3.Object, res: Response,
  rapp: rxme.Subject, s3: AWS.S3, config: any): void {
  if (!config.s3.UseMetaMtime) {
    res.write(`${link(so.Key.slice(mypath.length))} ${formatDate(so.LastModified)} ${leftPad(so.Size, 16, ' ')}\n`);
    return;
  }
  const params = {
    Bucket: config.s3.Bucket,
    Key: so.Key
  };
  s3.headObject(params, (err, headObject) => {
    if (err) {
      rapp.next(rxme.Msg.Error(err));
      return;
    }
    console.log(headObject);
    res.write([`${link(so.Key.slice(mypath.length))}`,
    `${formatDate(new Date(headObject.Metadata.Mtime))}`,
    `${leftPad(so.Size, 16, ' ')}\n`].join(' '));
  });
}

function renderDirectoryList(mypath: string, res: Response, rapp: rxme.Subject, s3: AWS.S3, config: any): rxme.Subject {
  const now = formatDate(new Date());
  return new rxme.Subject().match(rx => {
    // directory S3.CommonPrefixe
    if (!rx.data.Prefix) { return; }
    const so = rx.data as AWS.S3.CommonPrefix;
    res.write(`${link(so.Prefix.slice(mypath.length))} ${now} ${leftPad('-', 16, ' ')}\n`);
  }).match(rx => {
    // file S3.Object
    if (!rx.data.Key) { return; }
    const so = rx.data as AWS.S3.Object;
    resolvHeadObject(mypath, so, res, rapp, s3, config);
  }).match(rxme.Matcher.Complete(() => {
    res.write(footer());
    res.end();
  })).passTo();
}

export default function directoryMatcher(rq: simqle.Queue, rapp: rxme.Subject,
  s3: AWS.S3, config: any): rxme.MatcherCallback {
  return RxHttpMatcher((remw, sub) => {
    const { req, res } = remw;
    let mypath = req.url.replace(/\/+/g, '/');
    // console.log(`directoryMatcher:${mypath}:${req.url}`);
    if (mypath.startsWith(config.basepath)) {
      mypath = mypath.substr(config.basepath.length);
    }
    // rapp.next(rxme.LogInfo(`[${req.path}] [${mypath}]`));
    if (!mypath.endsWith('/')) {
      // not a directory
      return;
    }
    if (mypath.startsWith('/')) {
      mypath = mypath.substr(1);
    }
    const renderList = renderDirectoryList(mypath, res, rapp, s3, config);

    res.write(top(config, mypath));
    if (mypath.length > 1) {
      res.write(`${link('..')} ${formatDate(new Date())} ${leftPad('-', 16, ' ')}\n`);
    }
    rapp.next(rxme.LogInfo('directoryMatcher:', mypath));

    const listObjects = new rxme.Subject().match(rx => {
      // console.log(`listObject:Match:`, config.s3.Bucket, rx.data);
      // rapp.next(rxme.LogDebug(`listObject:Match:`, config.s3.Bucket, rx.data));
      if (rx.data.Contents && rx.data.CommonPrefixes) {
        const sloo = rx.data as AWS.S3.Types.ListObjectsOutput;
        // console.log(`CommonPrefix:${JSON.stringify(sloo.CommonPrefixes)}`);
        (sloo.CommonPrefixes || []).forEach(cp => renderList.next(new rxme.RxMe(cp)));
        (sloo.Contents || []).forEach(cs => renderList.next(new rxme.RxMe(cs)));
        if (!sloo.IsTruncated) {
          renderList.complete();
        }
      }
    }).match(rxme.Matcher.Complete(() => true)).passTo(rapp);
    rq.push(loopListObjects(rq, s3, config, mypath, listObjects), (new rxme.Subject()).passTo());
  });
}
