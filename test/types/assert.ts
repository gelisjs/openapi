export type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false;

export type Expect<Value extends true> = Value;
