import { describe, expect, it } from "vitest";
import { P0_TRIGGER_IDS } from "../src/shared/settings/types";

describe("shared contracts", () => { it("exposes the default P0 trigger IDs", () => { expect(P0_TRIGGER_IDS).toEqual(["alarm-siren", "dishes-clatter", "applause"]); }); });
