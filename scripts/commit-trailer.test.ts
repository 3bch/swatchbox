// commit-trailer の単体テスト。
//
// 関数ひとつを describe の単位とし、テストリスト（testlist.md）の順に積んでいく。
// 実コマンド（git / mise / ccusage）やファイルシステムには依存させず、
// 純粋関数として切り出せる部分だけを対象にする。
import { describe, expect, test } from "vitest";

import { round6 } from "#scripts/commit-trailer.ts";

describe(round6, () => {
  test("小数第 7 位が切り上がる", () => {
    expect(round6(1.23456789)).toBe(1.234568);
  });

  test("小数第 7 位が切り捨てられる", () => {
    expect(round6(1.23456712)).toBe(1.234567);
  });

  test("小数第 6 位までの値は変わらない", () => {
    expect(round6(1.234567)).toBe(1.234567);
    expect(round6(0.000001)).toBe(0.000001);
  });

  test("整数と 0 は変わらない", () => {
    expect(round6(42)).toBe(42);
    expect(round6(0)).toBe(0);
  });

  test("負の値も符号を保ったまま丸まる", () => {
    expect(round6(-1.23456789)).toBe(-1.234568);
    expect(round6(-1.2345671)).toBe(-1.234567);
  });

  test("差分計算で出た浮動小数点の誤差が畳まれる", () => {
    // 0.3 - 0.1 は 0.19999999999999998 になる。
    expect(round6(0.3 - 0.1)).toBe(0.2);
  });

  // 入力の検証は Session / Report スキーマの責務であり、round6 の責務ではない。
  test("非有限な値は検証せずそのまま返る", () => {
    expect(round6(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(round6(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
    expect(round6(Number.NaN)).toBeNaN();
  });
});
