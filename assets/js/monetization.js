/* Garden Monetization v1: official VK Bridge ads; no simulated impressions.
 * Payment initiation is intentionally gated until a trusted callback backend exists.
 */
(() => {
  'use strict';

  const CONFIG = Object.freeze({
    rewardCoins: 100,
    minSessionMs: 30000,
    rewardCooldownMs: 60000,
    interstitialCooldownMs: 150000,
    interstitialEveryResults: 2,
    paymentsVerifiedOnServer: false
  });

  const startedAt = Date.now();
  const params = new URLSearchParams(window.location.search || '');
  const launchPlatform = String(params.get('vk_platform') || '').toLowerCase();
  const isOkAndroid = launchPlatform.includes('android') ||
    (/Android/i.test(navigator.userAgent || '') && Boolean(window.AndroidBridge));
  let busy = false;
  let rewardAt = 0;
  let interstitialAt = 0;
  let resultCount = 0;
  let lastBannerAttempt = 0;
  let bannerVisible = false;
  let bannerBusy = false;
  let currentView = 'game';
  let currentPhase = 'briefing';
  let hooks = null;
  let ui = null;

  function environment() {
    return window.GardenPlatform?.state?.environment || 'standalone';
  }
  function supportsFullscreenAds() {
    const env = environment();
    // The published VK Bridge-in-OK compatibility matrix lists native ads on Android.
    // Avoid advertising a nonworking reward button on OK web/mobile web/iOS.
    return env === 'vk' || (env === 'ok' && isOkAndroid);
  }
  function canShowBanner() {
    // VK native banner API is not documented in the OK compatibility table.
    return environment() === 'vk';
  }
  function isActive() {
    return !document.hidden && Date.now() - startedAt >= CONFIG.minSessionMs;
  }
  function notify(message, type) {
    if (hooks?.notify) hooks.notify(message, type || '');
    else console.info('[GardenMonetization]', message);
  }
  async function bridgeCall(method, options) {
    const initialized = await window.GardenPlatform?.init?.();
    if (!initialized || !window.vkBridge || typeof window.vkBridge.send !== 'function') {
      throw new Error('VK Bridge недоступен');
    }
    return window.vkBridge.send(method, options || {});
  }
  async function adAvailable(format) {
    if (!supportsFullscreenAds() || !isActive()) return false;
    try {
      const response = await bridgeCall('VKWebAppCheckNativeAds', {ad_format: format});
      return response?.result === true;
    } catch (error) {
      console.warn('[GardenMonetization] ad availability:', format, error);
      return false;
    }
  }
  async function showNativeAd(format) {
    const response = await bridgeCall('VKWebAppShowNativeAds', {ad_format: format});
    return response?.result === true;
  }
  function awardId() {
    const random = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : (Date.now().toString(36) + ':' + Math.random().toString(36).slice(2));
    return 'ad:' + environment() + ':' + random;
  }
  function refreshUI() {
    if (!ui) return;
    const eligible = supportsFullscreenAds();
    ui.button.disabled = busy || !eligible || !isActive();
    ui.status.textContent = !eligible
      ? environment() === 'ok'
        ? 'В ОК этот формат через VK Bridge поддерживается на Android.'
        : 'Реклама доступна только внутри VK или ОК.'
      : !isActive()
        ? 'Реклама станет доступна через 30 секунд после запуска.'
        : busy
          ? 'Проверяем и показываем рекламу…'
          : 'Награда начисляется только после успешного просмотра.';
  }
  async function watchReward() {
    if (busy || !supportsFullscreenAds()) return false;
    if (!isActive()) {
      notify('Реклама доступна через 30 секунд после открытия игры.', 'bad');
      return false;
    }
    if (rewardAt && Date.now() - rewardAt < CONFIG.rewardCooldownMs) {
      notify('Следующая рекламная награда будет доступна чуть позже.', 'bad');
      return false;
    }
    if (!hooks?.grantReward) {
      notify('Игровая экономика ещё загружается.', 'bad');
      return false;
    }
    busy = true;
    refreshUI();
    try {
      if (!await adAvailable('reward')) {
        notify('Сейчас нет доступной рекламы. Попробуйте позже.', 'bad');
        return false;
      }
      const completed = await showNativeAd('reward');
      if (!completed) {
        notify('Реклама не завершена — монеты не начислены.', 'bad');
        return false;
      }
      const credited = hooks.grantReward(awardId(), CONFIG.rewardCoins);
      if (!credited) {
        notify('Не удалось начислить монеты. Проверьте игровой прогресс.', 'bad');
        return false;
      }
      rewardAt = Date.now();
      notify('Начислено +' + CONFIG.rewardCoins + ' монет за просмотр рекламы.', 'good');
      return true;
    } catch (error) {
      console.warn('[GardenMonetization] rewarded ad:', error);
      notify('Реклама недоступна или просмотр отменён. Награда не начислена.', 'bad');
      return false;
    } finally {
      busy = false;
      refreshUI();
    }
  }
  async function showInterstitial() {
    if (busy || !supportsFullscreenAds() || !isActive() ||
        currentPhase !== 'result' || currentView !== 'game') return false;
    const latestAdAt = Math.max(interstitialAt, rewardAt);
    if (latestAdAt && Date.now() - latestAdAt < CONFIG.interstitialCooldownMs) return false;
    busy = true;
    refreshUI();
    try {
      if (!await adAvailable('interstitial') ||
          currentPhase !== 'result' || currentView !== 'game' || document.hidden) return false;
      const shown = await showNativeAd('interstitial');
      if (shown) interstitialAt = Date.now();
      return shown;
    } catch (error) {
      console.warn('[GardenMonetization] interstitial ad:', error);
      return false;
    } finally {
      busy = false;
      refreshUI();
    }
  }
  function onLevelComplete() {
    resultCount++;
    if (resultCount % CONFIG.interstitialEveryResults === 0 &&
        Date.now() - startedAt >= CONFIG.minSessionMs) {
      window.setTimeout(() => { void showInterstitial(); }, 600);
    }
  }
  async function hideBanner() {
    if (!bannerVisible || bannerBusy) return;
    bannerBusy = true;
    try { await bridgeCall('VKWebAppHideBannerAd'); }
    catch (error) { console.warn('[GardenMonetization] hide banner:', error); }
    finally { bannerVisible = false; bannerBusy = false; }
  }
  async function showBanner() {
    if (!canShowBanner() || bannerVisible || bannerBusy || !isActive() ||
        currentView !== 'map' || busy ||
        (lastBannerAttempt && Date.now() - lastBannerAttempt < 45000)) return false;
    lastBannerAttempt = Date.now();
    bannerBusy = true;
    try {
      const available = await bridgeCall('VKWebAppCheckBannerAd');
      if (available?.result !== true || currentView !== 'map' || document.hidden) return false;
      // Host resizes the view rather than covering the level-map controls.
      const shown = await bridgeCall('VKWebAppShowBannerAd', {
        banner_location: 'bottom', layout_type: 'resize', can_close: true
      });
      bannerVisible = shown?.result === true;
      return bannerVisible;
    } catch (error) {
      console.warn('[GardenMonetization] banner:', error);
      return false;
    } finally {
      bannerBusy = false;
      if (bannerVisible && currentView !== 'map') void hideBanner();
    }
  }
  function setContext(context) {
    currentView = context?.view || 'game';
    currentPhase = context?.phase || 'briefing';
    if (currentView === 'map') {
      void showBanner();
      // If map was opened during the 30-second no-ads window, retry once
      // when the initial window ends, without requiring another navigation.
      const remaining = Math.max(0, startedAt + CONFIG.minSessionMs - Date.now());
      if (remaining > 0 && remaining <= CONFIG.minSessionMs) {
        window.setTimeout(() => {
          if (currentView === 'map' && !document.hidden) void showBanner();
        }, remaining + 150);
      }
    } else void hideBanner();
  }
  async function requestVkPurchase(productCode) {
    // No payment UI or virtual-item credit until a real callback service exists.
    // SDK success only opens the order dialog; it does NOT prove fulfilment.
    if (!CONFIG.paymentsVerifiedOnServer || environment() !== 'vk') {
      notify('Платные покупки появятся после настройки проверки платежей.', 'bad');
      return false;
    }
    const products = ['garden_coins_500', 'garden_boosters_3'];
    if (!products.includes(productCode)) return false;
    try {
      await bridgeCall('VKWebAppShowOrderBox', {type: 'item', item: productCode});
      return true;
    } catch (error) {
      console.warn('[GardenMonetization] payment:', error);
      notify('Не удалось открыть платёжное окно.', 'bad');
      return false;
    }
  }
  function mountShop() {
    const shopItems = document.getElementById('shopItems');
    if (!shopItems || document.getElementById('gardenAdOffer')) return;
    const panel = document.createElement('section');
    panel.id = 'gardenAdOffer';
    panel.className = 'garden-ad-offer';
    const title = document.createElement('strong');
    title.textContent = 'Бесплатные монеты за рекламу';
    const description = document.createElement('p');
    description.textContent = 'Посмотри рекламу до конца и получи +100 монет.';
    const button = document.createElement('button');
    button.className = 'garden-ad-button';
    button.type = 'button';
    button.textContent = 'Смотреть рекламу · +100 монет';
    button.addEventListener('click', () => { void watchReward(); });
    const status = document.createElement('small');
    status.className = 'garden-ad-status';
    status.setAttribute('role', 'status');
    panel.append(title, description, button, status);
    // Place the offer BEFORE five booster cards; no scrolling needed on phones.
    shopItems.insertAdjacentElement('beforebegin', panel);
    ui = {panel, button, status};
    if (environment() === 'standalone') panel.hidden = true;
    refreshUI();
    window.setTimeout(refreshUI, CONFIG.minSessionMs + 100);
  }
  function registerGameHooks(nextHooks) {
    if (nextHooks && typeof nextHooks.grantReward === 'function') {
      hooks = {grantReward: nextHooks.grantReward, notify: nextHooks.notify};
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void hideBanner();
    else if (currentView === 'map') void showBanner();
  });
  mountShop();
  window.GardenMonetization = Object.freeze({
    registerGameHooks, watchReward, onLevelComplete,
    setContext, requestVkPurchase,
    getStatus: () => ({
      environment: environment(), eligible: supportsFullscreenAds(),
      okAndroid: environment() === 'ok' && isOkAndroid,
      paymentReady: CONFIG.paymentsVerifiedOnServer,
      reward: CONFIG.rewardCoins, bannerVisible
    })
  });
})();
