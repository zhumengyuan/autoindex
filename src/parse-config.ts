import * as yargs from 'yargs';
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
// import { Bucket } from 'aws-sdk/clients/s3';
import * as https from 'https';
// import { ServerOptions } from 'http2';

// export interface Https {
//   privateKey: string;
//   certificate: string;
// }

export interface S3 {
  Bucket: string;
  UseMetaMtime: boolean;
  Concurrent: number;
}

export interface AWSConfig {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  sslEnabled: boolean;
  s3ForcePathStyle: boolean;
}

export interface Config {
  basepath: string;
  port: number;
  https?: https.ServerOptions;
  s3: S3;
  aws: AWSConfig;
  aws_module: string;
}

export default function parseConfig(argv: string[]): Config {
  const y = yargs.usage('$0 <cmd> [args]');
  y.option('basepath', {
    describe: 'basepath currently unused',
    default: process.env.BASEPATH || ''
  }).option('port', {
    describe: 'port',
    default: parseInt(process.env.PORT, 10) || 9000,
  }).option('https-privateKey', {
    describe: 'pemfile of private key',
  }).option('https-certificate', {
    describe: 'pemfile of certificate'
  }).option('s3-Bucket', {
    describe: 's3 bucket name',
    default: process.env.S3_BUCKET,
    require: !process.env.S3_BUCKET
  }).option('s3-use-meta-mtime', {
    describe: 'use headobject call to get mtime(rclone)',
    default: false
  }).option('s3-concurrent', {
    describe: 'nr of concurrent requests',
    default: 8
  }).option('aws-module', {
    describe: 'aws module could load the mock',
    default: 'aws'
  }).option('aws-accessKeyId', {
    describe: 'aws accessKeyId',
    default: process.env.AWS_ACCESS_KEY_ID
  }).option('aws-secretAccessKey', {
    describe: 'aws secretAccessKey',
    default: process.env.AWS_SECRET_ACCESS_KEY
  }).option('aws-profile', {
    describe: 'load credential profile ',
    default: 'default'
  }).option('aws-endpoint', {
    describe: 'endpoint url',
    default: process.env.AWS_ENDPOINT
  }).option('aws-sslEnabled', {
    describe: 'enable ssl communication',
    default: true
  }).option('aws-s3ForcePathStyle', {
    describe: 'path-style bucket access',
    default: true
  }).help().parse(argv);
  const cred = {
    accessKeyId: y.argv.awsAccessKeyId,
    secretAccessKey: y.argv.awsSecretAccessKey
  };
  if (y.argv.awsProfile) {
    const credential = new AWS.SharedIniFileCredentials({ profile: y.argv.awsProfile });
    cred.accessKeyId = cred.accessKeyId || credential.accessKeyId;
    cred.secretAccessKey = cred.secretAccessKey || credential.secretAccessKey;
  }
  const config: Config = {
    basepath: y.argv.basepath,
    port: y.argv.port,
    s3: {
      Bucket: y.argv.s3Bucket,
      UseMetaMtime: y.argv.s3UseMetaMtime,
      Concurrent: y.argv.s3Concurrent
    },
    aws_module: y.argv.awsModule,
    aws: {
      accessKeyId: cred.accessKeyId,
      secretAccessKey: cred.secretAccessKey,
      // The endpoint must be s3.scality.test, else SSL will not work
      endpoint: y.argv.awsEndpoint,
      sslEnabled: y.argv.awsSslEnabled,
      // With this setup, you must use path-style bucket access
      s3ForcePathStyle: y.argv.awsS3ForcePathStyle,
    }
  };
  if (y.argv.httpsPrivateKey && y.argv.httpsCertificate) {
    config.https = {
      key: fs.readFileSync(y.argv.httpsPrivateKey).toString(),
      cert: fs.readFileSync(y.argv.httpsCertificate).toString()
    };
  }
  return config;
}
