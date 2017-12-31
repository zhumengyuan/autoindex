import * as RxMe from 'rxme';
export default function QWorker(input: RxMe.Observable, output: RxMe.Subject): void {
  input.passTo(output);
}
