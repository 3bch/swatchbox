// commit-trailer の単体テスト。
//
// 関数ひとつを describe の単位とし、テストリスト（testlist.md）の順に積んでいく。
// 実コマンド（git / mise / ccusage）やファイルシステムには依存させず、
// 純粋関数として切り出せる部分だけを対象にする。
import { describe, expect, test } from "vitest";

import { byValueDesc, diff, round3 } from "#scripts/commit-trailer.ts";

describe(round3, () => {
  test("小数第 4 位が切り上がる", () => {
    expect(round3(1.2346)).toBe(1.235);
  });

  test("小数第 4 位が切り捨てられる", () => {
    expect(round3(1.2341)).toBe(1.234);
  });

  test("小数第 3 位までの値は変わらない", () => {
    expect(round3(1.234)).toBe(1.234);
    expect(round3(0.001)).toBe(0.001);
  });

  test("整数と 0 は変わらない", () => {
    expect(round3(42)).toBe(42);
    expect(round3(0)).toBe(0);
  });

  test("負の値も符号を保ったまま丸まる", () => {
    expect(round3(-1.2346)).toBe(-1.235);
    expect(round3(-1.2341)).toBe(-1.234);
  });

  test("差分計算で出た浮動小数点の誤差が畳まれる", () => {
    // 0.3 - 0.1 は 0.19999999999999998 になる。
    expect(round3(0.3 - 0.1)).toBe(0.2);
  });

  // 入力の検証は Session / Report スキーマの責務であり、round3 の責務ではない。
  test("非有限な値は検証せずそのまま返る", () => {
    expect(round3(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(round3(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
    expect(round3(Number.NaN)).toBeNaN();
  });
});

describe(diff, () => {
  test("通常の差分", () => {
    expect(diff(300, 120)).toBe(180);
  });

  test("前回値が現在値を上回る場合は 0", () => {
    expect(diff(120, 300)).toBe(0);
  });

  test("現在値と前回値が等しければ 0", () => {
    expect(diff(300, 300)).toBe(0);
  });

  test("基準が 0", () => {
    expect(diff(300, 0)).toBe(300);
  });
});

describe(byValueDesc, () => {
  test("value の降順に並ぶ", () => {
    expect(
      byValueDesc(
        new Map([
          ["Bash", 1],
          ["Read", 3],
          ["Edit", 2],
        ]),
      ),
    ).toEqual([
      ["Read", 3],
      ["Edit", 2],
      ["Bash", 1],
    ]);
  });

  // 挿入順（Read → Bash）と辞書順（Bash → Read）が食い違う入力にしてある。
  // 並びが JSONL の初登場順や ccusage の出力順に左右されないことの確認。
  test("同値の要素はキーのコードポイント順に並ぶ", () => {
    expect(
      byValueDesc(
        new Map([
          ["Read", 2],
          ["Bash", 2],
          ["Edit", 5],
        ]),
      ),
    ).toEqual([
      ["Edit", 5],
      ["Bash", 2],
      ["Read", 2],
    ]);
  });

  test("空の入力は空配列", () => {
    expect(byValueDesc(new Map())).toEqual([]);
  });
});
