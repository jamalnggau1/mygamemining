// AdsGram rewarded ads — powers the "Tonton Iklan" button.
// Official docs: https://docs.adsgram.ai/publisher/reward-interstitial-integration
// SDK script (sad.min.js) is loaded in client/index.html and exposes
// window.Adsgram. Per the docs, AdController.show() resolves when the
// user watches a Rewarded ad till the end (result.done === true) and
// REJECTS on error, no-fill, or early close — so a reward is granted
// only on a resolved show() with done === true.
//
// TODO: paste the real blockId here — the owner gets it from
// https://partner.adsgram.ai (register the Mini App, create a Reward
// ad unit). Until a blockId is set, the button keeps its current
// direct-reward behavior (server-validated watchAd) and no ad SDK
// call is made at all.
export const ADSGRAM_BLOCK_ID: string = "60777";

/** Rewarded ads are 15–30s; past this the SDK promise is treated as
 *  hung and the tap is answered "no ad" instead of blocking the UI. */
const SHOW_TIMEOUT_MS = 120_000;

let controller: AdsgramAdController | null = null;
let initTried = false;

/** Lazily inits the SDK once. Returns null when there is no blockId,
 *  the script failed to load, or init throws. Never throws. */
function getController(): AdsgramAdController | null {
  if (controller) return controller;
  if (initTried) return null;
  initTried = true;
  try {
    const sdk = window.Adsgram;
    if (!sdk || ADSGRAM_BLOCK_ID === "") return null;
    controller = sdk.init({ blockId: ADSGRAM_BLOCK_ID });
    return controller;
  } catch {
    return null;
  }
}

/** True once the owner has pasted a real blockId above. */
export function isAdsConfigured(): boolean {
  return ADSGRAM_BLOCK_ID !== "";
}

/** Shows one rewarded ad. Returns true ONLY when the ad was watched
 *  to the end; false on no-fill, early close, error, timeout, or
 *  missing SDK/blockId. Never throws to the caller. */
export async function showRewardedAd(): Promise<boolean> {
  const ctl = getController();
  if (!ctl) return false;
  try {
    const result = await Promise.race([
      ctl.show(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), SHOW_TIMEOUT_MS);
      }),
    ]);
    return result !== null && result.done === true && result.error !== true;
  } catch {
    return false;
  }
}
