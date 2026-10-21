/* global jQuery */
jQuery(function ($) {
  'use strict';
  const categories = ['PC・周辺機器', 'オフィス用品', 'その他'];
  const element = (tag, text, attributes = {}) => $('<' + tag + '>').attr(attributes).text(text);
  const button = (text, handler, className = 'button secondary') => element('button', text, { type: 'button', class: className }).on('click', handler);
  function select(id, values, placeholder) {
    const field = element('select', '', { id });
    if (placeholder) field.append(element('option', placeholder, { value: '' }));
    values.forEach(value => field.append(element('option', value, { value })));
    return field;
  }
  function labeled(label, field) {
    return element('div', '', { class: 'field' }).append(element('label', label, { for: field.attr('id') }), field);
  }

  let equipment = [];
  const main = element('main', '', { class: 'workspace' });
  $('#app').append(
    element('header', '', { class: 'topbar' }).append(
      element('span', 'S', { class: 'brand-mark', 'aria-hidden': 'true' }),
      element('span', 'Stockroom', { class: 'brand' }),
      element('span', '備品管理デモ', { class: 'environment' })
    ), main
  );
  main.append(element('p', 'WORKSPACE / INVENTORY', { class: 'eyebrow' }));
  const heading = element('div', '', { class: 'page-heading' }).append(
    element('div').append(element('h1', '備品管理'), element('p', 'オフィスの備品を、ひとつの場所で。', { class: 'muted' }))
  );
  main.append(heading);
  const announcement = element('div', '', { role: 'status', class: 'notice' });
  const failure = element('div', '', { role: 'alert', class: 'notice error' });
  const stats = element('section', '', { class: 'stats', 'aria-label': '備品の集計' });
  const search = element('input', '', { id: 'search', type: 'search', placeholder: '備品名を入力…' });
  const categoryFilter = select('category-filter', categories, 'すべてのカテゴリ');
  const toolbar = element('div', '', { class: 'toolbar' }).append(
    labeled('備品名で検索', search), labeled('カテゴリで絞り込み', categoryFilter),
    button('条件をクリア', () => { search.val(''); categoryFilter.val(''); render(); }, 'button quiet')
  );
  const caption = element('caption', '備品一覧');
  const body = element('tbody');
  const table = element('table').append(caption,
    element('thead').append(element('tr').append(...['備品名', 'カテゴリ', '数量', '状態', '操作'].map(text => element('th', text, { scope: 'col' })))), body);
  const empty = element('div', '', { class: 'empty' }).append(element('span', '□', { 'aria-hidden': 'true', class: 'empty-icon' }), element('p', '備品が見つかりません'), element('small', '検索条件を変更してみてください。'));
  const loading = element('p', '備品を読み込み中…', { role: 'status', class: 'loading' });
  main.append(announcement, failure, stats, element('section', '', { class: 'panel', 'aria-label': '備品一覧と検索' }).append(toolbar, loading, element('div', '', { class: 'table-scroll' }).append(table), empty));
  main.append(element('footer', 'Stockroom · Spring Boot + jQuery', { class: 'footer' }));

  function render() {
    const query = String(search.val()).trim().toLocaleLowerCase();
    const category = categoryFilter.val();
    const filtered = equipment.filter(item => item.name.toLocaleLowerCase().includes(query) && (!category || item.category === category));
    stats.empty();
    for (const [label, value, detail] of [
      ['登録備品', equipment.length, '種類の備品'],
      ['合計数量', equipment.reduce((total, item) => total + item.quantity, 0), '個のアイテム'],
      ['貸出中', equipment.filter(item => item.status === '貸出中').length, '種類の備品']
    ]) stats.append(element('div', '', { class: 'stat' }).append(element('span', label), element('strong', String(value)), element('small', detail)));
    caption.text('備品一覧 · ' + filtered.length + '件');
    body.empty();
    filtered.forEach(item => {
      const actions = element('td', '', { class: 'actions' });
      body.append(element('tr').append(
        element('td', item.name, { class: 'equipment-name' }), element('td', item.category),
        element('td', String(item.quantity), { class: 'quantity' }),
        element('td').append(element('span', item.status, { class: 'badge ' + (item.status === '貸出中' ? 'loaned' : 'available') })), actions
      ));
    });
    empty.prop('hidden', filtered.length !== 0);
    table.prop('hidden', filtered.length === 0);
  }

  async function load() {
    loading.prop('hidden', false);
    failure.empty();
    try {
      equipment = await $.ajax({ url: '/api/equipment', dataType: 'json' });
      render();
    } catch {
      failure.append(element('span', '備品を取得できませんでした。'), button('再試行', load));
    } finally {
      loading.prop('hidden', true);
    }
  }
  search.on('input', render);
  categoryFilter.on('change', render);
  empty.prop('hidden', true);
  table.prop('hidden', true);
  load();
});
