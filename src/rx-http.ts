import * as rxme from 'rxme';
import * as http from 'http';

export declare type Request = http.IncomingMessage;
export declare type Response = http.ServerResponse;

export class RxHttpMiddleWare {
  public readonly req: Request;
  public readonly res: Response;
  // public readonly next: NextFunction;
  constructor(req: Request, res: Response/*, next: NextFunction */) {
    this.req = req;
    this.res = res;
    // this.next = next;
  }
}
export function RxHttp(req: Request, res: Response/*, next: NextFunction*/): rxme.RxMe {
  return rxme.Msg.Type(new RxHttpMiddleWare(req, res/*, next */));
}

export function RxHttpMatcher(cb:
  (remw: RxHttpMiddleWare, sub: rxme.Subject) => rxme.MatchReturn): rxme.MatcherCallback {
  return rxme.Matcher.Type(RxHttpMiddleWare, cb);
}
