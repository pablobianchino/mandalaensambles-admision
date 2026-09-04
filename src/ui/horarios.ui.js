// =======================================================================
// src/ui/horarios.ui.js — Formateo y gestión de disponibilidad de horarios
// =======================================================================

import { diasSemana } from "../config/constants.js";

export function limpiarHoraParaChip(h) {
    if (!h) return '';
    return h.endsWith(':00') ? h.replace(':00', '') : h;
}

export function formatearChipHorario(rango, hApertura = '09:00', hCierre = '22:00') {
    if (!rango || (!rango.inicio && !rango.fin)) return '-';
    let ini = (rango.inicio || '').trim();
    let fin = (rango.fin || '').trim();

    if (rango.flex === true || rango.tipo === 'flex') {
        return 'Flex';
    }

    if ((ini === hApertura || !ini) && (fin === hCierre || !fin)) {
        return 'Libre';
    }
    if ((ini === hApertura || !ini) && fin && fin < hCierre) {
        return `${limpiarHoraParaChip(fin)}-`;
    }
    if (ini && (fin === hCierre || !fin || fin >= hCierre)) {
        return `${limpiarHoraParaChip(ini)}+`;
    }
    return `${limpiarHoraParaChip(ini)}-${limpiarHoraParaChip(fin)}`;
}

export function formatearDiaCompletoChips(rangosDia, hApertura = '09:00', hCierre = '22:00') {
    if (!rangosDia || rangosDia.length === 0) return '-';
    const chips = rangosDia.map(r => formatearChipHorario(r, hApertura, hCierre)).filter(c => c && c !== '-');
    if (chips.length === 0) return '-';
    if (chips.includes('Flex')) return 'Flex';
    if (chips.includes('Libre')) return 'Libre';
    return chips.join('<br>');
}

export function crearFilaRangoHTML(diaId, inicio = '', fin = '', esProfe = false, index = 0) {
    return `
        <div class="rango-item" style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <input type="time" class="modern-input rango-inicio" value="${inicio}" style="width:auto; padding:5px 8px; font-size:12.5px;">
            <span style="font-size:12px; color:var(--text-muted);">a</span>
            <input type="time" class="modern-input rango-fin" value="${fin}" style="width:auto; padding:5px 8px; font-size:12.5px;">
            <button type="button" class="btn-quitar-rango" data-dia="${diaId}" data-profe="${esProfe}" title="Eliminar este rango" style="background:none; border:none; cursor:pointer; font-size:1em; padding:2px 4px; ${index === 0 ? 'display:none;' : ''}">🗑️</button>
        </div>
    `;
}

export function renderContenedorDisponibilidad(containerId, esProfe = false) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    cont.classList.add('contenedor-disponibilidad-box');
    cont.innerHTML = '';
    
    diasSemana.forEach(dia => {
        const diaRow = document.createElement('div');
        diaRow.className = 'dia-disponibilidad-row';
        diaRow.setAttribute('data-dia', dia.id);
        diaRow.setAttribute('data-profe', String(esProfe));
        diaRow.style.cssText = 'background:var(--hover-bg); border:1px solid var(--border-color); border-radius:8px; padding:8px 12px; margin-bottom:8px; display:flex; flex-direction:column; gap:4px;';
        
        diaRow.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <strong style="min-width:75px; font-size:13px; color:var(--text-main);">${dia.nombre}:</strong>
                    <label style="font-weight:normal; margin:0; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:4px; text-transform:none;">
                        <input type="checkbox" class="chk-disp-all" data-dia="${dia.id}" data-profe="${esProfe}"> Todo el día
                    </label>
                    <label style="font-weight:700; margin:0; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:4px; text-transform:none; color:#7c3aed;">
                        <input type="checkbox" class="chk-disp-flex" data-dia="${dia.id}" data-profe="${esProfe}"> Flex
                    </label>
                    <label style="font-weight:normal; margin:0; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:4px; text-transform:none;">
                        <input type="checkbox" class="chk-disp-none" data-dia="${dia.id}" data-profe="${esProfe}"> No disp.
                    </label>
                </div>
                <div style="display:flex; align-items:center; gap:6px; margin-left:auto;">
                    <button type="button" class="${esProfe ? 'btn-copy-disp-p' : 'btn-copy-disp'}" data-dia="${dia.id}" title="Copiar horario" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📋</button>
                    <button type="button" class="${esProfe ? 'btn-paste-disp-p' : 'btn-paste-disp'}" data-dia="${dia.id}" title="Pegar horario" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📥</button>
                    <span class="estado-disp" style="width:75px; text-align:right; font-size:11.5px; font-weight:700;"></span>
                </div>
            </div>
            <div class="rangos-list" style="display:flex; flex-direction:column; gap:2px; margin-top:4px;">
                ${crearFilaRangoHTML(dia.id, '', '', esProfe, 0)}
            </div>
            <div style="display:flex; justify-content:flex-start; margin-top:2px;">
                <button type="button" class="btn-agregar-rango" data-dia="${dia.id}" data-profe="${esProfe}" style="background:#fff; border:1px dashed var(--border-color); border-radius:6px; padding:3px 8px; font-size:11.5px; font-weight:600; color:var(--accent-teal); cursor:pointer; display:inline-flex; align-items:center; gap:4px;">➕ Agregar Rango</button>
            </div>
        `;
        cont.appendChild(diaRow);
    });
}

export function actualizarBotonesQuitarRangoEnFila(diaRow) {
    if (!diaRow) return;
    const items = diaRow.querySelectorAll('.rango-item');
    items.forEach(item => {
        const btnDel = item.querySelector('.btn-quitar-rango');
        if (btnDel) {
            btnDel.style.display = items.length > 1 ? 'inline-block' : 'none';
        }
    });
}

export function updateDispStateForRow(diaRow) {
    if (!diaRow) return;
    const chkAll = diaRow.querySelector('.chk-disp-all');
    const chkFlex = diaRow.querySelector('.chk-disp-flex');
    const chkNone = diaRow.querySelector('.chk-disp-none');
    const spanE = diaRow.querySelector('.estado-disp');
    const rangosList = diaRow.querySelector('.rangos-list');
    const btnAgregar = diaRow.querySelector('.btn-agregar-rango');
    if (!rangosList) return;

    const inputs = rangosList.querySelectorAll('input[type="time"]');
    const btnsDel = rangosList.querySelectorAll('.btn-quitar-rango');

    if (chkAll && chkAll.checked) {
        if (chkFlex) chkFlex.checked = false;
        if (chkNone) chkNone.checked = false;
        inputs.forEach(inp => { inp.value = ''; });
        btnsDel.forEach(b => b.disabled = true);
        if (btnAgregar) btnAgregar.style.display = 'none';
        if (spanE) { spanE.textContent = "Libre"; spanE.style.color = "var(--accent-teal)"; }
    } else if (chkFlex && chkFlex.checked) {
        if (chkAll) chkAll.checked = false;
        if (chkNone) chkNone.checked = false;
        inputs.forEach(inp => { inp.value = ''; });
        btnsDel.forEach(b => b.disabled = true);
        if (btnAgregar) btnAgregar.style.display = 'none';
        if (spanE) { spanE.textContent = "Flex"; spanE.style.color = "#7c3aed"; }
    } else if (chkNone && chkNone.checked) {
        if (chkAll) chkAll.checked = false;
        if (chkFlex) chkFlex.checked = false;
        inputs.forEach(inp => { inp.value = ''; });
        btnsDel.forEach(b => b.disabled = true);
        if (btnAgregar) btnAgregar.style.display = 'none';
        if (spanE) { spanE.textContent = "Bloqueado"; spanE.style.color = "var(--accent-red)"; }
    } else {
        btnsDel.forEach(b => b.disabled = false);
        if (btnAgregar) btnAgregar.style.display = 'inline-flex';
        if (spanE) { spanE.textContent = ""; }
    }
}

export function resolverContenedorDisponibilidad(target) {
    if (!target) return document.getElementById('contenedor-disponibilidad');
    if (typeof target === 'string') return document.getElementById(target);
    if (target instanceof HTMLElement) {
        return target.classList.contains('contenedor-disponibilidad-box') ? target : target.closest('.contenedor-disponibilidad-box');
    }
    if (target === true) {
        // Docente: chequear cuál modal está visible
        const mUser = document.getElementById('modal-abm-edit');
        if (mUser && mUser.open) {
            const divUser = document.getElementById('div-abm-edit-usuario');
            if (divUser && divUser.style.display !== 'none') return document.getElementById('contenedor-disponibilidad-user-profe');
            return document.getElementById('contenedor-disponibilidad-profe');
        }
        const mPerf = document.getElementById('modal-mi-perfil');
        if (mPerf && mPerf.open) return document.getElementById('contenedor-disponibilidad-mi-perfil');
        return document.getElementById('contenedor-disponibilidad-user-profe') || document.getElementById('contenedor-disponibilidad-profe');
    }
    return document.getElementById('contenedor-disponibilidad');
}

export function poblarDisponibilidadMultiRango(disp = {}, containerRef = false, hApe = '09:00', hCie = '22:00', modoLectura = false) {
    const cont = resolverContenedorDisponibilidad(containerRef);
    if (!cont) return;

    diasSemana.forEach(dia => {
        const diaRow = cont.querySelector(`.dia-disponibilidad-row[data-dia="${dia.id}"]`);
        if (!diaRow) return;

        const dD = (disp && disp[dia.id]) || [];
        const rangosList = diaRow.querySelector('.rangos-list');
        const cA = diaRow.querySelector('.chk-disp-all');
        const cFlex = diaRow.querySelector('.chk-disp-flex');
        const cN = diaRow.querySelector('.chk-disp-none');
        const esProfe = diaRow.getAttribute('data-profe') === 'true';

        if (rangosList) rangosList.innerHTML = '';
        if (cA) cA.checked = false;
        if (cFlex) cFlex.checked = false;
        if (cN) cN.checked = false;

        if (dD.length === 0) {
            if (cN) cN.checked = true;
            if (rangosList) rangosList.innerHTML = crearFilaRangoHTML(dia.id, '', '', esProfe, 0);
        } else if (dD.length === 1 && (dD[0].flex === true || dD[0].tipo === 'flex')) {
            if (cFlex) cFlex.checked = true;
            if (rangosList) rangosList.innerHTML = crearFilaRangoHTML(dia.id, '', '', esProfe, 0);
        } else if (dD.length === 1 && dD[0].inicio === hApe && dD[0].fin === hCie) {
            if (cA) cA.checked = true;
            if (rangosList) rangosList.innerHTML = crearFilaRangoHTML(dia.id, '', '', esProfe, 0);
        } else {
            dD.forEach((rango, idx) => {
                if (rangosList) rangosList.innerHTML += crearFilaRangoHTML(dia.id, rango.inicio || '', rango.fin || '', esProfe, idx);
            });
        }
        actualizarBotonesQuitarRangoEnFila(diaRow);
        updateDispStateForRow(diaRow);

        if (modoLectura) {
            diaRow.querySelectorAll('input, button, select').forEach(el => {
                el.disabled = true;
                if (el.tagName === 'BUTTON') el.style.display = 'none';
            });
        } else {
            diaRow.querySelectorAll('input, select').forEach(el => el.disabled = false);
        }
    });
}

export function normalizarHora(val, defaultVal = '') {
    if (!val && val !== 0) return defaultVal;
    let s = String(val).trim().replace('.', ':');
    if (!s || s === '--:--' || s === '--') return defaultVal;
    if (s.includes(':')) {
        const parts = s.split(':');
        const h = parseInt(parts[0], 10);
        if (isNaN(h)) return defaultVal;
        const m = parseInt(parts[1], 10);
        const mStr = isNaN(m) ? '00' : m.toString().padStart(2, '0');
        return `${h.toString().padStart(2, '0')}:${mStr}`;
    }
    const n = parseInt(s, 10);
    if (!isNaN(n) && n >= 0 && n <= 23) {
        return `${n.toString().padStart(2, '0')}:00`;
    }
    return defaultVal;
}

export function extraerDisponibilidadMultiRango(containerRef = false, hApe = '09:00', hCie = '22:00') {
    const cont = resolverContenedorDisponibilidad(containerRef);
    if (!cont) return {};

    const disp = {};
    diasSemana.forEach(d => {
        const diaRow = cont.querySelector(`.dia-disponibilidad-row[data-dia="${d.id}"]`);
        if (!diaRow) {
            disp[d.id] = [];
            return;
        }

        const cA = diaRow.querySelector('.chk-disp-all')?.checked;
        const cFlex = diaRow.querySelector('.chk-disp-flex')?.checked;
        const cN = diaRow.querySelector('.chk-disp-none')?.checked;

        if (cN) {
            disp[d.id] = [];
        } else if (cFlex) {
            disp[d.id] = [{ inicio: normalizarHora(hApe, '09:00'), fin: normalizarHora(hCie, '22:00'), flex: true }];
        } else if (cA) {
            disp[d.id] = [{ inicio: normalizarHora(hApe, '09:00'), fin: normalizarHora(hCie, '22:00') }];
        } else {
            const rangosList = diaRow.querySelector('.rangos-list');
            const items = rangosList ? rangosList.querySelectorAll('.rango-item') : [];
            const arr = [];
            items.forEach(item => {
                const rawI = item.querySelector('.rango-inicio')?.value || '';
                const rawF = item.querySelector('.rango-fin')?.value || '';
                const i = normalizarHora(rawI, '');
                const f = normalizarHora(rawF, '');
                if (i || f) {
                    arr.push({ inicio: i || normalizarHora(hApe, '09:00'), fin: f || normalizarHora(hCie, '22:00') });
                }
            });
            disp[d.id] = arr;
        }
    });
    return disp;
}

// Auto-completar :00 en cualquier input type="time" cuando se ingresa solo la hora
export function inicializarAutocompletadoHorarios() {
    if (window._autocompletadoHorariosInit) return;
    window._autocompletadoHorariosInit = true;

    const inputDigitsMap = new WeakMap();

    document.addEventListener('keydown', (e) => {
        const target = e.target;
        if (!target || target.type !== 'time') return;

        if (e.key >= '0' && e.key <= '9') {
            let curr = inputDigitsMap.get(target) || '';
            curr += e.key;
            if (curr.length > 2) curr = e.key;
            inputDigitsMap.set(target, curr);
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
            inputDigitsMap.set(target, '');
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            const digits = inputDigitsMap.get(target);
            if (digits && digits.length > 0 && !target.value) {
                let h = parseInt(digits, 10);
                if (!isNaN(h) && h >= 0 && h <= 23) {
                    target.value = `${h.toString().padStart(2, '0')}:00`;
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                    target.dispatchEvent(new Event('change', { bubbles: true }));
                    inputDigitsMap.set(target, '');
                }
            }
        }
    }, true);

    document.addEventListener('focusout', (e) => {
        const target = e.target;
        if (!target || target.type !== 'time') return;

        const digits = inputDigitsMap.get(target);
        if (digits && digits.length > 0 && !target.value) {
            let h = parseInt(digits, 10);
            if (!isNaN(h) && h >= 0 && h <= 23) {
                target.value = `${h.toString().padStart(2, '0')}:00`;
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        inputDigitsMap.set(target, '');
    }, true);
}

// Global helpers
window.poblarDisponibilidadMultiRango = poblarDisponibilidadMultiRango;
window.extraerDisponibilidadMultiRango = extraerDisponibilidadMultiRango;
window.normalizarHora = normalizarHora;

if (typeof document !== 'undefined') {
    inicializarAutocompletadoHorarios();
}
