import * as rxme from 'rxme';
import { RxHttpMatcher } from './rx-http';
// import { Response, Request } from 'express-serve-static-core';
import { Response } from './rx-http';
import * as AWS from 'aws-sdk';
import * as simqle from 'simqle';
import { ServerResponse } from 'http';
import { Config } from './parse-config';
import { myPath } from './server';

function loopListObjects(rq: simqle.Queue, s3: AWS.S3, config: Config, mypath: string,
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
        listObjects.complete();
        obs.complete();
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

function resolvHeadObject(mypath: string, so: AWS.S3.Object, rq: simqle.Queue,
  rapp: rxme.Subject, res: Response, s3: AWS.S3, config: any, cpl: rxme.Subject, obs: rxme.Observer): void {
  if (!config.s3.UseMetaMtime) {
    res.write(`${link(so.Key.slice(mypath.length))} ${formatDate(so.LastModified)} ${leftPad(so.Size, 16, ' ')}\n`);
    cpl.stopPass(false);
    cpl.complete();
    obs.complete();
    return;
  }
  const params = {
    Bucket: config.s3.Bucket,
    Key: so.Key
  };
  rq.push(rxme.Observable.create(_obs => {
    s3.headObject(params, (err, headObject) => {
      if (err) {
        rapp.next(rxme.Msg.Error(err));
        cpl.stopPass(false);
        _obs.complete();
        return;
      }
      let mtime = so.LastModified;
      if (headObject.Metadata.mtime) {
        mtime = new Date(parseInt(headObject.Metadata.mtime, 10) * 1000);
      }
      res.write([`${link(so.Key.slice(mypath.length))}`,
      `${formatDate(new Date(mtime))}`,
      `${leftPad(so.Size, 16, ' ')}\n`].join(' '));
      cpl.stopPass(false);
      _obs.complete();
    });
  }), (new rxme.Subject()).passTo(obs));
}

function loopDirectoryItem(mypath: string, cps: (AWS.S3.CommonPrefix | AWS.S3.Object)[], idx: number,
  rq: simqle.Queue, rapp: rxme.Subject, res: ServerResponse, done: rxme.Subject,
  s3: AWS.S3, config: any, now: string): void {
  if (idx >= cps.length) {
    done.next(rxme.Msg.Number(cps.length));
    return;
  }
  const data = cps[idx];
  if ((data as AWS.S3.CommonPrefix).Prefix) {
    const so = (data as AWS.S3.CommonPrefix);
    res.write(`${link(so.Prefix.slice(mypath.length))} ${now} ${leftPad('-', 16, ' ')}\n`);
    loopDirectoryItem(mypath, cps, idx + 1, rq, rapp, res, done, s3, config, now);
    return;
  } else if ((data as AWS.S3.Object).Key) {
    const cpl = (new rxme.Subject()).match(rxme.Matcher.Complete(() => {
      loopDirectoryItem(mypath, cps, idx + 1, rq, rapp, res, done, s3, config, now);
      return true;
    })).passTo(rapp);
    rq.push(rxme.Observable.create(obs => {
      resolvHeadObject(mypath, (data as AWS.S3.Object), rq, rapp, res, s3, config, cpl, obs);
    }), cpl);
  }
//   }).match((rx, cpl) => {
//     // file S3.Object
//     if (!rx.data.Key) { return; }
//     const so = rx.data as AWS.S3.Object;
//     resolvHeadObject(mypath, so, res, rq, rapp, s3, config, cpl);
//     return cpl;
//   }).match(rxme.Matcher.Complete(() => {
//     // res.write(footer());
//     // res.end();
//   })).passTo();
// }

//   resolvHeadObject(mypath, so: AWS.S3.Object, res: Response, rq: simqle.Queue,
//     rapp: rxme.Subject, s3: AWS.S3, config: any, cpl: rxme.Subject);

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

export default function directoryMatcher(rq: simqle.Queue, rapp: rxme.Subject,
  s3: AWS.S3, config: Config): rxme.MatcherCallback {
  return RxHttpMatcher((remw, sub) => {
    const { req, res } = remw;
    const mypath = myPath(config, req.url);
    if (!mypath.isDirectory()) {
      // not a directory
      return;
    }
    // const renderList = renderDirectoryList(mypath, res, rq, rapp, s3, config);
    res.statusCode = 200;
    res.setHeader('X-s3-autoindex', config.version);
    res.write(top(config, mypath.name));
    if (mypath.name.length > 1) {
      res.write(`${link('..')} ${formatDate(new Date())} ${leftPad('-', 16, ' ')}\n`);
    }
    rapp.next(rxme.LogInfo('directoryMatcher:', mypath));

    let doneCount = 0;
    let needsDoneCount = 0;
    const done = new rxme.Subject();
    done.match(rxme.Matcher.Number(nr => {
      doneCount += nr;
      // console.log(`DoneCount:${doneCount}:${needsDoneCount}`);
      if (doneCount >= needsDoneCount) {
        res.write(footer());
        res.end();
        done.complete();
      }
    })).passTo();

    const now = formatDate(new Date());
    const listObjects = new rxme.Subject().match(rx => {
      // console.log(`listObject:Match:`, config.s3.Bucket, rx.data);
      // rapp.next(rxme.LogDebug(`listObject:Match:`, config.s3.Bucket, rx.data));
      if (rx.data.Contents && rx.data.CommonPrefixes) {
        const sloo = rx.data as AWS.S3.Types.ListObjectsOutput;
        // console.log(`CommonPrefix:${JSON.stringify(sloo.CommonPrefixes)}`);
        const cps = sloo.CommonPrefixes || [];
        const cts = sloo.Contents || [];
        needsDoneCount += cps.length + cts.length;
        loopDirectoryItem(mypath.name, cps, 0, rq, rapp, res, done, s3, config, now);
        loopDirectoryItem(mypath.name, cts, 0, rq, rapp, res, done, s3, config, now);
      }
    }).match(rxme.Matcher.Log(lg => {
      if (lg.level == rxme.LogLevel.ERROR) {
        res.write('----------------------- ERROR -----------------------\n');
        res.write(JSON.stringify(lg, null, 2));
        res.write('\n----------------------- ERROR -----------------------\n');
        done.next(rxme.Msg.Number(0x10000000));
      }
    })).match(rxme.Matcher.Complete(() => true)).passTo(rapp);
    rq.push(loopListObjects(rq, s3, config, mypath.name, listObjects), (new rxme.Subject()).passTo());
  });
}
