// ==================== STATE ====================
let state = {
  orders: [],
  reviews: [],
  alipayWithdrawals: [],
  settings: {
    yuanToByn: 4.5,
    yuanToBynExchange: 4.2,
    yuanToRub: 12.0,
    dollarToYuan: 7.0,
    autoPricePerKg: 6,
    airTariffs: { standard: 120, economy: 110, fast: 100 }
  }
};

let db = null;
let useFirebase = false;

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  loadLocal();
  initNavigation();
  renderAll();
});

function initFirebase() {
  if (typeof firebaseConfig === 'undefined' || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    useFirebase = false;
    setSyncStatus('Офлайн режим', false);
    return;
  }
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    useFirebase = true;
    listenFirebase();
    setSyncStatus('Синхронизировано ✓', true);
  } catch (e) {
    useFirebase = false;
    setSyncStatus('Ошибка Firebase', false);
  }
}

function listenFirebase() {
  db.ref('orders').on('value', snap => {
    state.orders = snap.val() || [];
    renderAll();
    setSyncStatus('Синхронизировано ✓', true);
    saveLocal();
  });
  db.ref('reviews').on('value', snap => {
    state.reviews = snap.val() || [];
    renderAll();
    saveLocal();
  });
  db.ref('alipayWithdrawals').on('value', snap => {
    state.alipayWithdrawals = snap.val() || [];
    renderAll();
    saveLocal();
  });
  db.ref('settings').on('value', snap => {
    if (snap.val()) {
      state.settings = { ...state.settings, ...snap.val() };
      loadSettingsForm();
      renderAll();
    }
  });
}

function setSyncStatus(text, ok) {
  const el = document.getElementById('syncStatus');
  if (el) el.textContent = text;
}

// ==================== LOCAL STORAGE ====================
function saveLocal() {
  localStorage.setItem('underrbuy_crm', JSON.stringify(state));
}

function loadLocal() {
  const data = localStorage.getItem('underrbuy_crm');
  if (data) {
    const saved = JSON.parse(data);
    state = { ...state, ...saved };
  }
  loadSettingsForm();
}

// ==================== FIREBASE SAVE ====================
function firebaseSave(path, data) {
  if (!useFirebase || !db) return;
  db.ref(path).set(data);
}

// ==================== NAVIGATION ====================
function initNavigation() {
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      navigateTo(page);
    });
  });
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));
}

// ==================== RENDER ====================
function renderAll() {
  renderDashboard();
  renderOrders();
  renderReviews();
}

function renderDashboard() {
  // Stats
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const calcProfit = (from, to) => state.orders
    .filter(o => o.createdAt >= from.getTime() && o.createdAt <= to.getTime())
    .reduce((sum, o) => sum + getProfit(o), 0);

  const todayProfit = calcProfit(todayStart, now);
  const weekProfit = calcProfit(weekStart, now);
  const monthProfit = calcProfit(monthStart, now);
  const yearProfit = calcProfit(yearStart, now);

  const rate = state.settings.yuanToBynExchange || state.settings.yuanToByn;

  document.getElementById('statToday').textContent = formatMoney(todayProfit) + ' BYN';
  document.getElementById('statTodayYuan').textContent = '≈ ' + formatMoney(todayProfit / rate) + ' ¥';
  document.getElementById('statWeek').textContent = formatMoney(weekProfit) + ' BYN';
  document.getElementById('statWeekYuan').textContent = '≈ ' + formatMoney(weekProfit / rate) + ' ¥';
  document.getElementById('statMonth').textContent = formatMoney(monthProfit) + ' BYN';
  document.getElementById('statMonthYuan').textContent = '≈ ' + formatMoney(monthProfit / rate) + ' ¥';
  document.getElementById('statYear').textContent = formatMoney(yearProfit) + ' BYN';
  document.getElementById('statYearYuan').textContent = '≈ ' + formatMoney(yearProfit / rate) + ' ¥';

  // Alipay balance
  const totalEarned = state.orders.reduce((sum, o) => sum + getProfitYuan(o), 0);
  const totalWithdrawn = state.alipayWithdrawals.reduce((sum, w) => sum + (w.amountYuan || 0), 0);
  document.getElementById('alipayBalance').textContent = formatMoney(totalEarned - totalWithdrawn) + ' ¥';

  // Recent orders
  const recent = [...state.orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const container = document.getElementById('recentOrders');
  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет заказов</div>';
    return;
  }
  container.innerHTML = recent.map(o => renderOrderCard(o, true)).join('');
}

function renderOrders() {
  const search = (document.getElementById('orderSearch')?.value || '').toLowerCase();
  const status = document.getElementById('filterStatus')?.value || '';
  const delivery = document.getElementById('filterDelivery')?.value || '';

  let filtered = [...state.orders];
  if (search) {
    filtered = filtered.filter(o =>
      (o.telegram || '').toLowerCase().includes(search) ||
      (o.trackNumber || '').toLowerCase().includes(search)
    );
  }
  if (status) filtered = filtered.filter(o => o.status === status);
  if (delivery) filtered = filtered.filter(o => o.deliveryType === delivery);

  filtered.sort((a, b) => b.createdAt - a.createdAt);

  const container = document.getElementById('ordersList');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет заказов</div>';
    return;
  }
  container.innerHTML = filtered.map(o => renderOrderCard(o, false)).join('');
}

function renderOrderCard(order, compact) {
  const profit = getProfit(order);
  const profitYuan = getProfitYuan(order);
  const remaining = (order.clientPrice || 0) - (order.prepayment || 0);
  const currency = order.currency || 'BYN';
  const statusLabels = {
    awaiting: 'Ожидает',
    in_transit: 'В пути',
    received_by_me: 'Получен мной',
    sent_to_client: 'Отправлен клиенту',
    completed: 'Завершён'
  };
  const deliveryLabel = order.deliveryType === 'air' ? 'Авиа' : 'Авто';

  let profitDisplay = `<span class="card-profit">${formatMoney(profit)} ${currency}</span>`;
  if (currency === 'BYN') {
    profitDisplay += ` <span class="card-profit-sub">(≈ ${formatMoney(profitYuan)} ¥)</span>`;
  } else {
    const profitByn = profitYuan * state.settings.yuanToBynExchange;
    profitDisplay += ` <span class="card-profit-sub">(≈ ${formatMoney(profitByn)} BYN | ≈ ${formatMoney(profitYuan)} ¥)</span>`;
  }

  if (compact) {
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${esc(order.product)}</span>
          <span style="font-size:12px;color:var(--gray)">${statusLabels[order.status] || order.status}</span>
        </div>
        <div class="card-info">
          ${esc(order.telegram)} · ${deliveryLabel} · ${formatMoney(order.clientPrice)} ${currency}
        </div>
      </div>`;
  }

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${esc(order.product)}</span>
        <button class="card-delete" onclick="deleteOrder('${order.id}')" title="Удалить">&times;</button>
      </div>
      <div class="card-status">
        <select class="select" onchange="changeOrderStatus('${order.id}', this.value)">
          ${Object.entries(statusLabels).map(([k, v]) =>
            `<option value="${k}" ${order.status === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
      <div class="card-info">
        ${esc(order.telegram)} · ${deliveryLabel}<br>
        Цена клиента: <strong>${formatMoney(order.clientPrice)} ${currency}</strong><br>
        ${remaining > 0
          ? `Остаток: <strong>${formatMoney(remaining)} ${currency}</strong>`
          : `<span class="card-prepaid">✓ Оплачено</span>`}<br>
        Прибыль: ${profitDisplay}
        ${order.trackNumber ? `<br>Трек: <strong>${esc(order.trackNumber)}</strong>` : ''}
      </div>
    </div>`;
}

function renderReviews() {
  const search = (document.getElementById('reviewSearch')?.value || '').toLowerCase();
  const status = document.getElementById('filterReviewStatus')?.value || '';

  let filtered = [...state.reviews];
  if (search) {
    filtered = filtered.filter(r => (r.telegram || '').toLowerCase().includes(search));
  }
  if (status) filtered = filtered.filter(r => r.status === status);

  const container = document.getElementById('reviewsList');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет клиентов</div>';
    return;
  }

  const statusLabels = {
    not_wrote: 'Ещё не написал',
    waiting: 'Жду',
    left: 'Оставил'
  };

  container.innerHTML = filtered.map(r => `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${esc(r.telegram)}</span>
        <button class="card-delete" onclick="deleteReview('${r.id}')" title="Удалить">&times;</button>
      </div>
      <div class="card-status">
        <select class="select" onchange="changeReviewStatus('${r.id}', this.value)">
          ${Object.entries(statusLabels).map(([k, v]) =>
            `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
      ${r.comment ? `<div class="card-info">${esc(r.comment)}</div>` : ''}
    </div>`).join('');
}

// ==================== CALCULATIONS ====================
function getDeliveryYuan(order) {
  const w = order.weightKg || 0;
  if (order.deliveryType === 'auto') {
    return w * (state.settings.autoPricePerKg || 6) * (state.settings.dollarToYuan || 7);
  }
  const tariff = order.airTariff || state.settings.airTariffs.standard || 120;
  return w * tariff;
}

function getCost(order) {
  const delivery = getDeliveryYuan(order);
  const totalYuan = (order.priceYuan || 0) + delivery;
  return totalYuan * (order.rateYuanToCurrency || state.settings.yuanToByn);
}

function getProfit(order) {
  return (order.clientPrice || 0) - getCost(order);
}

function getProfitYuan(order) {
  const profit = getProfit(order);
  if (order.currency === 'RUB') {
    return profit / (state.settings.yuanToRub || 12);
  }
  return profit / (state.settings.yuanToBynExchange || state.settings.yuanToByn || 4.2);
}

// ==================== ORDERS CRUD ====================
function saveOrder() {
  const order = {
    id: 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    product: document.getElementById('orderProduct').value.trim(),
    telegram: document.getElementById('orderTelegram').value.trim(),
    deliveryType: document.getElementById('orderDeliveryType').value,
    airTariff: parseInt(document.getElementById('orderAirTariff').value),
    currency: document.getElementById('orderCurrency').value,
    priceYuan: parseFloat(document.getElementById('orderPriceYuan').value) || 0,
    weightKg: parseFloat(document.getElementById('orderWeight').value) || 0,
    rateYuanToCurrency: parseFloat(document.getElementById('orderRate').value) || state.settings.yuanToByn,
    clientPrice: parseFloat(document.getElementById('orderClientPrice').value) || 0,
    prepayment: parseFloat(document.getElementById('orderPrepayment').value) || 0,
    trackNumber: document.getElementById('orderTrack').value.trim(),
    comment: document.getElementById('orderComment').value.trim(),
    status: 'awaiting',
    createdAt: Date.now()
  };

  if (!order.product) return alert('Укажите товар');

  state.orders.push(order);
  saveLocal();
  firebaseSave('orders', state.orders);
  closeModal();
  clearOrderForm();
  renderAll();
}

function deleteOrder(id) {
  if (!confirm('Удалить заказ?')) return;
  state.orders = state.orders.filter(o => o.id !== id);
  saveLocal();
  firebaseSave('orders', state.orders);
  renderAll();
}

function changeOrderStatus(id, status) {
  const order = state.orders.find(o => o.id === id);
  if (order) {
    order.status = status;
    saveLocal();
    firebaseSave('orders', state.orders);
    renderAll();
  }
}

function clearOrderForm() {
  ['orderProduct', 'orderTelegram', 'orderPriceYuan', 'orderWeight',
   'orderClientPrice', 'orderPrepayment', 'orderTrack', 'orderComment'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('orderDeliveryType').value = 'auto';
  document.getElementById('orderCurrency').value = 'BYN';
  toggleAirTariff();
  updateOrderPreview();
}

// ==================== REVIEWS CRUD ====================
function saveReview() {
  const review = {
    id: 'rev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    telegram: document.getElementById('reviewTelegram').value.trim(),
    status: document.getElementById('reviewStatus').value,
    comment: document.getElementById('reviewComment').value.trim(),
    createdAt: Date.now()
  };

  if (!review.telegram) return alert('Укажите Telegram');

  state.reviews.push(review);
  saveLocal();
  firebaseSave('reviews', state.reviews);
  closeModal();
  document.getElementById('reviewTelegram').value = '';
  document.getElementById('reviewComment').value = '';
  renderAll();
}

function deleteReview(id) {
  if (!confirm('Удалить клиента?')) return;
  state.reviews = state.reviews.filter(r => r.id !== id);
  saveLocal();
  firebaseSave('reviews', state.reviews);
  renderAll();
}

function changeReviewStatus(id, status) {
  const review = state.reviews.find(r => r.id === id);
  if (review) {
    review.status = status;
    saveLocal();
    firebaseSave('reviews', state.reviews);
    renderAll();
  }
}

// ==================== ALIPAY ====================
function saveWithdraw() {
  const amount = parseFloat(document.getElementById('withdrawAmount').value);
  if (!amount || amount <= 0) return alert('Укажите сумму');

  const withdrawal = {
    id: 'w_' + Date.now(),
    amountYuan: amount,
    comment: document.getElementById('withdrawComment').value.trim(),
    createdAt: Date.now()
  };

  state.alipayWithdrawals.push(withdrawal);
  saveLocal();
  firebaseSave('alipayWithdrawals', state.alipayWithdrawals);
  document.getElementById('withdrawAmount').value = '';
  document.getElementById('withdrawComment').value = '';
  renderWithdrawals();
  renderDashboard();
}

function deleteWithdraw(id) {
  if (!confirm('Удалить вывод?')) return;
  state.alipayWithdrawals = state.alipayWithdrawals.filter(w => w.id !== id);
  saveLocal();
  firebaseSave('alipayWithdrawals', state.alipayWithdrawals);
  renderWithdrawals();
  renderDashboard();
}

function renderWithdrawals() {
  const container = document.getElementById('withdrawalsList');
  if (!container) return;
  const list = [...state.alipayWithdrawals].sort((a, b) => b.createdAt - a.createdAt);
  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет выводов</div>';
    return;
  }
  container.innerHTML = list.map(w => `
    <div class="card" style="margin-bottom:8px">
      <div class="card-header">
        <span class="card-title">${formatMoney(w.amountYuan)} ¥</span>
        <button class="card-delete" onclick="deleteWithdraw('${w.id}')">&times;</button>
      </div>
      ${w.comment ? `<div class="card-info">${esc(w.comment)}</div>` : ''}
      <div class="card-info">${new Date(w.createdAt).toLocaleDateString('ru')}</div>
    </div>`).join('');
}

// ==================== SETTINGS ====================
function loadSettingsForm() {
  const s = state.settings;
  document.getElementById('setYuanToByn').value = s.yuanToByn;
  document.getElementById('setYuanToBynExchange').value = s.yuanToBynExchange;
  document.getElementById('setYuanToRub').value = s.yuanToRub;
  document.getElementById('setDollarToYuan').value = s.dollarToYuan;
  document.getElementById('setAutoPrice').value = s.autoPricePerKg;
  document.getElementById('setAirStandard').value = s.airTariffs.standard;
  document.getElementById('setAirEconomy').value = s.airTariffs.economy;
  document.getElementById('setAirFast').value = s.airTariffs.fast;
}

function saveSettings() {
  state.settings = {
    yuanToByn: parseFloat(document.getElementById('setYuanToByn').value) || 4.5,
    yuanToBynExchange: parseFloat(document.getElementById('setYuanToBynExchange').value) || 4.2,
    yuanToRub: parseFloat(document.getElementById('setYuanToRub').value) || 12,
    dollarToYuan: parseFloat(document.getElementById('setDollarToYuan').value) || 7,
    autoPricePerKg: parseFloat(document.getElementById('setAutoPrice').value) || 6,
    airTariffs: {
      standard: parseInt(document.getElementById('setAirStandard').value) || 120,
      economy: parseInt(document.getElementById('setAirEconomy').value) || 110,
      fast: parseInt(document.getElementById('setAirFast').value) || 100
    }
  };
  saveLocal();
  firebaseSave('settings', state.settings);
  renderAll();
}

// Auto-save settings on input
document.addEventListener('input', (e) => {
  if (e.target.closest('#page-settings')) {
    clearTimeout(window._settingsTimer);
    window._settingsTimer = setTimeout(saveSettings, 500);
  }
});

// ==================== EXPORT / IMPORT ====================
function exportData() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `underrbuy_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.orders) state.orders = data.orders;
      if (data.reviews) state.reviews = data.reviews;
      if (data.alipayWithdrawals) state.alipayWithdrawals = data.alipayWithdrawals;
      if (data.settings) state.settings = { ...state.settings, ...data.settings };
      saveLocal();
      firebaseSave('orders', state.orders);
      firebaseSave('reviews', state.reviews);
      firebaseSave('alipayWithdrawals', state.alipayWithdrawals);
      firebaseSave('settings', state.settings);
      loadSettingsForm();
      renderAll();
      alert('Данные импортированы');
    } catch (err) {
      alert('Ошибка чтения файла');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ==================== MODALS ====================
function openModal(type) {
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('modal-' + type).classList.add('active');
  if (type === 'newOrder') {
    document.getElementById('orderRate').value = state.settings.yuanToByn;
    toggleAirTariff();
  }
  if (type === 'withdraw') {
    renderWithdrawals();
  }
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  document.body.style.overflow = '';
}

// ==================== ORDER PREVIEW ====================
function toggleAirTariff() {
  const isAir = document.getElementById('orderDeliveryType').value === 'air';
  document.getElementById('airTariffGroup').style.display = isAir ? 'block' : 'none';
  updateOrderPreview();
}

function updateOrderPreview() {
  const priceYuan = parseFloat(document.getElementById('orderPriceYuan').value) || 0;
  const weight = parseFloat(document.getElementById('orderWeight').value) || 0;
  const rate = parseFloat(document.getElementById('orderRate').value) || state.settings.yuanToByn;
  const clientPrice = parseFloat(document.getElementById('orderClientPrice').value) || 0;
  const deliveryType = document.getElementById('orderDeliveryType').value;
  const currency = document.getElementById('orderCurrency').value;

  let deliveryYuan;
  if (deliveryType === 'auto') {
    deliveryYuan = weight * (state.settings.autoPricePerKg || 6) * (state.settings.dollarToYuan || 7);
  } else {
    const tariff = parseInt(document.getElementById('orderAirTariff').value) || 120;
    deliveryYuan = weight * tariff;
  }

  const totalYuan = priceYuan + deliveryYuan;
  const cost = totalYuan * rate;
  const profit = clientPrice - cost;

  document.getElementById('previewDelivery').textContent = formatMoney(deliveryYuan) + ' ¥';
  document.getElementById('previewCost').textContent = formatMoney(cost) + ' ' + currency;
  const profitEl = document.getElementById('previewProfit');
  profitEl.textContent = formatMoney(profit) + ' ' + currency;
  profitEl.style.color = profit >= 0 ? 'var(--black)' : '#c00';
}

// ==================== UTILITIES ====================
function formatMoney(n) {
  return parseFloat(n || 0).toFixed(2).replace(/\.00$/, '').replace(/(\d)(?=(\d{3})+\.)/g, '$1,');
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Filter listeners
document.addEventListener('DOMContentLoaded', () => {
  ['orderSearch', 'filterStatus', 'filterDelivery'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderOrders);
    document.getElementById(id)?.addEventListener('change', renderOrders);
  });
  ['reviewSearch', 'filterReviewStatus'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderReviews);
    document.getElementById(id)?.addEventListener('change', renderReviews);
  });
});
