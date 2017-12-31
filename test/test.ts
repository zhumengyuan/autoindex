import { assert } from 'chai';

import { server, RxHttpMatcher } from '../src/server';

import * as AWSMock from 'mock-aws-s3';
import * as uuid from 'uuid';
import * as request from 'request-promise-native';
import * as htmlparser from 'htmlparser2';
import * as rxme from 'rxme';
import * as memwatch from 'memwatch-next';
import { setTimeout } from 'timers';

const DomHandler = require('domhandler');
const DomUtils = require('domutils');

const testId = uuid.v4();
const testPort = '' + ~~((Math.random() * (65535 - 1024)) + 1024);

AWSMock.config.basePath = `dist/test`;
const s3 = new AWSMock.S3({});

function htmlToDom(htmlfrag: string): rxme.Observable {
  return rxme.Observable.create(obs => {
    const dhandler = new DomHandler((_: any, dom: any) => {
      // console.log(_, dom);
      obs.next(new rxme.RxMe(dom));
      obs.complete();
    });
    const parser = new htmlparser.Parser(dhandler);
    parser.write(htmlfrag);
    parser.end();
  });
}

// a FSM is simple but who can understand this -;)
const actions = [
  (idx: number, html: rxme.Observable, fname: string, cb: () => void) => {
    // console.log(html);
    html.match(rx => {
      if (!Array.isArray(rx.data)) { return; }
      // console.log(`Jojo:`, rx.data);
      const pre = DomUtils.getElementsByTagName('pre', rx.data, true);
      assert.equal(1, pre.length);
      assert.equal('', pre[0].next.data.trim());
    }).match(rxme.Matcher.Complete(() => {
      s3.putObject({ Body: '<hw>hello world</hw>', Bucket: testId, Key: 'hello-world' }, (err, data) => {
        // console.log(err, data);
        requestServer(idx + 1, fname, cb);
      });
    })).passTo();
  },
  (idx: number, html: rxme.Observable, fname: string, cb: () => void) => {
    html.match(rx => {
      if (!Array.isArray(rx.data)) { return; }
      // console.log(rx.data);
      const pre = DomUtils.getElementsByTagName('a', rx.data, true);
      assert.equal(2, pre.length);
      // console.log(pre[1].attribs);
      // console.log(pre[1].children);
      assert.equal('hello-world', pre[1].attribs.href);
      assert.equal('hello-world', pre[1].children[0].data);
    }).match(rxme.Matcher.Complete(() => {
      requestServer(idx + 1, `${fname}/hello-world`, cb);
    })).passTo();
  },
  (idx: number, html: rxme.Observable, fname: string, cb: () => void) => {
    html.match(rx => {
      if (!Array.isArray(rx.data)) { return; }
      // console.log(rx.data);
      const pre = DomUtils.getElementsByTagName('hw', rx.data, true);
      assert.equal(1, pre.length);
      assert.equal('hw', pre[0].name);
      // console.log(pre[1].children);
      assert.equal('hello world', pre[0].children[0].data);
    }).match(rxme.Matcher.Complete(() => {
      let next = idx + 1;
      if (fname.startsWith('/basepath')) {
        next = -1;
      }
      requestServer(next, '/basepath//', cb);
    })).passTo();
  }
];

function requestServer(idx: number, fname: string, cb: () => void): void {
  if (idx < 0) {
    // srv.close();
    cb();
    return;
  }
  const url = `http://localhost:${testPort}/${fname}`;
  // console.log(`requestServer:${url}:${idx}`);
  request(url).then(html => {
    // console.log(`requestServer:${html}`);
    actions[idx % actions.length](idx, htmlToDom(html), fname, cb);
  });
}

function forceGC(): void {
   if (global.gc) {
      global.gc();
   } else {
      console.warn('No GC hook! Start your program as `node --expose-gc file.js`.');
   }
}

s3.createBucket({ Bucket: testId }, (err, data) => {
  // console.log(`createBucket`, err);

  let looping = 1000;
  let obs: rxme.Observer;
  server([
    '--basepath', '/basepath',
    '--s3-Bucket', testId,
    '--port', testPort,
    '--aws-endpoint', 'https://mock.land',
    '--aws-module', 'mock'
  ]).match(rxme.Matcher.Log(log => {
    // if (log.level != rxme.LogLevel.DEBUG) {
      // console.log(log);
    // }
  })).match(rxme.Matcher.Observer(rx => {
    // console.log(rx);
    obs = rx;
  })).match(RxHttpMatcher(srv => {
    const hd = new memwatch.HeapDiff();
    function loop(): void {
      // console.log(looping);
      if (--looping > 0) {
       requestServer(0, '', loop);
      } else {
        obs.complete();
        forceGC();
        setTimeout(() => {
          const diff: any = hd.end();
          console.log(`Sending Complete:`, JSON.stringify({
            before: diff.before,
            after: diff.after
          }, null, 2));
        }, 50);
      }
    }
    loop();
  })).passTo();
});
