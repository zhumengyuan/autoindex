import * as rxme from 'rxme';
import { NextFunction, Response, Request } from 'express-serve-static-core';

export class RxExpressMiddleWare {
  public readonly req: Request;
  public readonly res: Response;
  public readonly next: NextFunction;
  constructor(req: Request, res: Response, next: NextFunction) {
    this.req = req;
    this.res = res;
    this.next = next;
  }
}
export function RxExpress(req: Request, res: Response, next: NextFunction): rxme.RxMe {
  return rxme.Msg.Type(new RxExpressMiddleWare(req, res, next));
}

export function RxExpressMatcher(cb:
  (remw: RxExpressMiddleWare, sub: rxme.Subject) => rxme.MatchReturn): rxme.MatcherCallback {
  return rxme.Matcher.Type(RxExpressMiddleWare, cb);
}
