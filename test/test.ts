import { assert } from 'chai';

import server from '../src/server';

import * as AWSMock from 'mock-aws-s3';
import * as uuid from 'uuid';
import * as request from 'request-promise-native';
import * as htmlparser from 'htmlparser2';
import * as rxme from 'rxme';
import * as https from 'https';
import * as http from 'http';

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
  (srv: https.Server | http.Server, idx: number, html: rxme.Observable) => {
    // console.log(html);
    html.match(rx => {
      if (!Array.isArray(rx.data)) { return; }
      // console.log(`Jojo:`, rx.data);
      const pre = DomUtils.getElementsByTagName('pre', rx.data, true);
      assert.equal(1, pre.length);
      assert.equal('', pre[0].next.data.trim());
    }).match(rxme.Matcher.Complete(() => {
      s3.putObject({ Body: 'hello world', Bucket: testId, Key: 'hello-world' }, (err, data) => {
        // console.log(err, data);
        requestServer(srv, idx + 1);
      });
    })).passTo();
  },
  (srv: https.Server | http.Server, idx: number, html: rxme.Observable) => {
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
      requestServer(srv, idx + 1);
    })).passTo();
  }
];

function requestServer(srv: https.Server | http.Server, idx: number): void {
  if (!actions[idx]) {
    srv.close();
    return;
  }
  request(`http://localhost:${testPort}/`).then(html => {
    // console.log(`requestServer:${html}`);
    actions[idx](srv, idx, htmlToDom(html));
  });
}

s3.createBucket({ Bucket: testId }, (err, data) => {
  console.log(`createBucket`, err);

  const srv = server([
    '--s3-Bucket', testId,
    '--port', testPort,
    '--aws-endpoint', 'https://mock.land',
    '--aws-module', 'mock'
  ]);
  requestServer(srv, 0);
});
