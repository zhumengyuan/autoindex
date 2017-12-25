import server from './server';
import * as rxme from 'rxme';

server(process.argv).match(rxme.Matcher.Log(log => {
  if (log.level != rxme.LogLevel.DEBUG) {
    console.log(log);
  }
})).passTo();
