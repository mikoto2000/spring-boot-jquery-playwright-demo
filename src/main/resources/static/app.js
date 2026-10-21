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
  function setBusy(dialog, busy) {
    dialog.attr('aria-busy', String(busy));
    dialog.find('input, select, button').prop('disabled', busy);
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
  heading.append(button('備品を登録', () => openEditor(), 'button primary'));
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

  const editor = element('dialog', '', { 'aria-labelledby': 'editor-title' });
  const editorTitle = element('h2', '', { id: 'editor-title' });
  const form = element('form', '', { novalidate: true });
  const nameInput = element('input', '', { id: 'equipment-name', maxlength: 80, autocomplete: 'off' });
  const categoryInput = select('equipment-category', categories, '選択してください');
  const quantityInput = element('input', '', { id: 'equipment-quantity', type: 'number', min: 0, max: 9999, step: 1 });
  const statusInput = select('equipment-status', ['利用可能', '貸出中']);
  const formFailure = element('div', '', { role: 'alert', class: 'notice error' });
  const fields = { name: nameInput, category: categoryInput, quantity: quantityInput, status: statusInput };
  const fieldErrors = {};
  for (const [key, label] of Object.entries({ name: '備品名', category: 'カテゴリ', quantity: '数量', status: '状態' })) {
    const errorId = 'error-' + key;
    fields[key].attr('aria-describedby', errorId);
    fieldErrors[key] = element('span', '', { id: errorId, class: 'field-error' });
    form.append(labeled(label, fields[key]).append(fieldErrors[key]));
  }
  const cancelEditor = button('キャンセル', () => editor[0].close());
  const save = element('button', '登録する', { type: 'submit', class: 'button primary' });
  form.append(formFailure, element('div', '', { class: 'dialog-actions' }).append(cancelEditor, save));
  editor.append(editorTitle, element('p', '備品の情報を入力してください。', { class: 'dialog-description' }), form);
  $('#app').append(editor);
  let editingId = null;
  let saving = false;

  function clearErrors() {
    formFailure.empty();
    Object.keys(fields).forEach(key => { fieldErrors[key].empty(); fields[key].removeAttr('aria-invalid'); });
  }

  function openEditor(item) {
    editingId = item?.id ?? null;
    editorTitle.text(item ? '備品の編集' : '備品の登録');
    save.text(item ? '更新する' : '登録する');
    nameInput.val(item?.name ?? '');
    categoryInput.val(item?.category ?? '');
    quantityInput.val(item?.quantity ?? 1);
    statusInput.val(item?.status ?? '利用可能');
    clearErrors();
    editor[0].showModal();
    nameInput.trigger('focus');
  }

  editor.on('cancel', event => { if (saving) event.preventDefault(); });
  form.on('submit', async event => {
    event.preventDefault();
    if (saving) return;
    clearErrors();
    const input = {
      name: String(nameInput.val()).trim(), category: categoryInput.val(),
      quantity: Number(quantityInput.val()), status: statusInput.val()
    };
    const errors = {};
    if (!input.name) errors.name = '備品名を入力してください';
    else if (input.name.length > 80) errors.name = '備品名は80文字以内で入力してください';
    if (!categories.includes(input.category)) errors.category = 'カテゴリを選択してください';
    if (quantityInput.val() === '' || !Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 9999) errors.quantity = '数量は0〜9999の整数で入力してください';
    if (Object.keys(errors).length) {
      Object.entries(errors).forEach(([key, message]) => {
        fieldErrors[key].text(message);
        fields[key].attr('aria-invalid', 'true');
      });
      fields[Object.keys(errors)[0]].trigger('focus');
      return;
    }
    saving = true;
    setBusy(editor, true);
    try {
      const response = await $.ajax({
        url: '/api/equipment' + (editingId === null ? '' : '/' + editingId),
        method: editingId === null ? 'POST' : 'PUT',
        contentType: 'application/json', data: JSON.stringify(input)
      });
      editor[0].close();
      announcement.text(response.message);
      await load();
    } catch {
      formFailure.text('保存できませんでした。入力内容を確認し、もう一度お試しください。');
    } finally {
      saving = false;
      setBusy(editor, false);
    }
  });

  const deleteDialog = element('dialog', '', { 'aria-labelledby': 'delete-title' });
  const deleteMessage = element('p', '', { class: 'dialog-description' });
  const deleteFailure = element('div', '', { role: 'alert', class: 'notice error' });
  const cancelDelete = button('キャンセル', () => deleteDialog[0].close());
  const confirmDelete = button('削除する', removeEquipment, 'button danger');
  deleteDialog.append(element('h2', '備品の削除', { id: 'delete-title' }), deleteMessage, deleteFailure,
    element('div', '', { class: 'dialog-actions' }).append(cancelDelete, confirmDelete));
  $('#app').append(deleteDialog);
  let deleting = null;
  let removing = false;
  deleteDialog.on('cancel', event => { if (removing) event.preventDefault(); });

  function openDelete(item) {
    deleting = item;
    deleteMessage.text('「' + item.name + '」を削除します。この操作は取り消せません。');
    deleteFailure.empty();
    deleteDialog[0].showModal();
    cancelDelete.trigger('focus');
  }

  async function removeEquipment() {
    if (removing) return;
    removing = true;
    setBusy(deleteDialog, true);
    deleteFailure.empty();
    try {
      await $.ajax({ url: '/api/equipment/' + deleting.id, method: 'DELETE' });
      equipment = equipment.filter(item => item.id !== deleting.id);
      render();
      deleteDialog[0].close();
      announcement.text('備品を削除しました');
      await load();
    } catch {
      deleteFailure.text('削除できませんでした。もう一度お試しください。');
    } finally {
      removing = false;
      setBusy(deleteDialog, false);
    }
  }

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
      actions.append(button('編集', () => openEditor(item), 'button quiet'), button('削除', () => openDelete(item), 'button quiet delete-link'));
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
