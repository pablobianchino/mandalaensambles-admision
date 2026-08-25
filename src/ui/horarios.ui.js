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

    // Caso 0: Todo el día
    if ((ini === hApertura || !ini) && (fin === hCierre || !fin)) {
        return 'Libre';
    }

    // Caso 1: Desde la apertura (o sin inicio especificado) hasta X hora -> "18-"
    if ((ini === hApertura || !ini) && fin && fin < hCierre) {
        return `${limpiarHoraParaChip(fin)}-`;
    }

    // Caso 2: Desde X hora hasta el cierre (o sin fin especificado) -> "18+"
    if (ini && (fin === hCierre || !fin || fin >= hCierre)) {
        return `${limpiarHoraParaChip(ini)}+`;
    }

    // Caso 3: Franja acotada intermedia -> "14-17" o "18:30-20"
    return `${limpiarHoraParaChip(ini)}-${limpiarHoraParaChip(fin)}`;
}

export function formatearDiaCompletoChips(rangosDia, hApertura = '09:00', hCierre = '22:00') {
    if (!rangosDia || rangosDia.length === 0) return '-';
    const chips = rangosDia.map(r => formatearChipHorario(r, hApertura, hCierre)).filter(c => c && c !== '-');
    if (chips.length === 0) return '-';
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
    const prefix = esProfe ? 'disp-p-' : 'disp-';
    cont.innerHTML = '';
    diasSemana.forEach(dia => {
        const diaRow = document.createElement('div');
        diaRow.className = 'dia-disponibilidad-row';
        diaRow.id = `row-${prefix}${dia.id}`;
        diaRow.style.cssText = 'background:var(--hover-bg); border:1px solid var(--border-color); border-radius:8px; padding:8px 12px; margin-bottom:8px; display:flex; flex-direction:column; gap:4px;';
        
        diaRow.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="min-width:75px; font-size:13px; color:var(--text-main);">${dia.nombre}:</strong>
                    <label style="font-weight:normal; margin:0; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:4px; text-transform:none;">
                        <input type="checkbox" id="${prefix}${dia.id}-all" class="chk-disp-all" data-dia="${dia.id}" data-profe="${esProfe}"> Todo el día
                    </label>
                    <label style="font-weight:normal; margin:0; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:4px; text-transform:none;">
                        <input type="checkbox" id="${prefix}${dia.id}-none" class="chk-disp-none" data-dia="${dia.id}" data-profe="${esProfe}"> No disp.
                    </label>
                </div>
                <div style="display:flex; align-items:center; gap:6px; margin-left:auto;">
                    <button type="button" class="${esProfe ? 'btn-copy-disp-p' : 'btn-copy-disp'}" data-dia="${dia.id}" title="Copiar horario" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📋</button>
                    <button type="button" class="${esProfe ? 'btn-paste-disp-p' : 'btn-paste-disp'}" data-dia="${dia.id}" title="Pegar horario" style="background:none; border:none; cursor:pointer; font-size:1.1em;">📥</button>
                    <span id="${esProfe ? 'estado-p-' : 'estado-'}${dia.id}" class="estado-disp" style="width:75px; text-align:right; font-size:11.5px; font-weight:700;"></span>
                </div>
            </div>
            <div id="rangos-${prefix}${dia.id}" class="rangos-list" style="display:flex; flex-direction:column; gap:2px; margin-top:4px;">
                ${crearFilaRangoHTML(dia.id, '', '', esProfe, 0)}
            </div>
            <div style="display:flex; justify-content:flex-start; margin-top:2px;">
                <button type="button" class="btn-agregar-rango" data-dia="${dia.id}" data-profe="${esProfe}" style="background:#fff; border:1px dashed var(--border-color); border-radius:6px; padding:3px 8px; font-size:11.5px; font-weight:600; color:var(--accent-teal); cursor:pointer; display:inline-flex; align-items:center; gap:4px;">➕ Agregar Rango</button>
            </div>
        `;
        cont.appendChild(diaRow);
    });
}

export function actualizarBotonesQuitarRango(diaId, esProfe = false) {
    const prefix = esProfe ? 'disp-p-' : 'disp-';
    const container = document.getElementById(`rangos-${prefix}${diaId}`);
    if (!container) return;
    const items = container.querySelectorAll('.rango-item');
    items.forEach((item) => {
        const btnDel = item.querySelector('.btn-quitar-rango');
        if (btnDel) {
            btnDel.style.display = items.length > 1 ? 'inline-block' : 'none';
        }
    });
}

export function agregarRangoDia(diaId, inicio = '', fin = '', esProfe = false) {
    const prefix = esProfe ? 'disp-p-' : 'disp-';
    const container = document.getElementById(`rangos-${prefix}${diaId}`);
    if (!container) return;
    const count = container.querySelectorAll('.rango-item').length;
    container.insertAdjacentHTML('beforeend', crearFilaRangoHTML(diaId, inicio, fin, esProfe, count));
    actualizarBotonesQuitarRango(diaId, esProfe);
    const chkAll = document.getElementById(`${prefix}${diaId}-all`);
    const chkNone = document.getElementById(`${prefix}${diaId}-none`);
    if (chkAll) chkAll.checked = false;
    if (chkNone) chkNone.checked = false;
    updateDispStateForDay(diaId, esProfe);
}

export function quitarRangoDia(btnElement) {
    const rangoItem = btnElement.closest('.rango-item');
    const diaId = btnElement.getAttribute('data-dia');
    const esProfe = btnElement.getAttribute('data-profe') === 'true';
    if (rangoItem) {
        rangoItem.remove();
        actualizarBotonesQuitarRango(diaId, esProfe);
        updateDispStateForDay(diaId, esProfe);
    }
}

export function updateDispStateForDay(dId, isProfe = false) {
    const prefix = isProfe ? 'disp-p-' : 'disp-', estadoPrefix = isProfe ? 'estado-p-' : 'estado-';
    const chkAll = document.getElementById(`${prefix}${dId}-all`), chkNone = document.getElementById(`${prefix}${dId}-none`);
    const spanE = document.getElementById(`${estadoPrefix}${dId}`);
    const rangosContainer = document.getElementById(`rangos-${prefix}${dId}`);
    const btnAgregar = document.querySelector(`.btn-agregar-rango[data-dia="${dId}"][data-profe="${isProfe}"]`);
    if (!chkAll || !rangosContainer) return;
    
    const inputs = rangosContainer.querySelectorAll('input[type="time"]');
    const btnsDel = rangosContainer.querySelectorAll('.btn-quitar-rango');
    
    if (chkAll.checked) {
        if (chkNone) chkNone.checked = false;
        inputs.forEach(inp => { inp.disabled = true; inp.value = ''; });
        btnsDel.forEach(b => b.disabled = true);
        if (btnAgregar) btnAgregar.style.display = 'none';
        if (spanE) { spanE.textContent = "Libre"; spanE.style.color = "var(--accent-teal)"; }
    } else if (chkNone && chkNone.checked) {
        chkAll.checked = false;
        inputs.forEach(inp => { inp.disabled = true; inp.value = ''; });
        btnsDel.forEach(b => b.disabled = true);
        if (btnAgregar) btnAgregar.style.display = 'none';
        if (spanE) { spanE.textContent = "Bloqueado"; spanE.style.color = "var(--accent-red)"; }
    } else {
        inputs.forEach(inp => { inp.disabled = false; });
        btnsDel.forEach(b => b.disabled = false);
        if (btnAgregar) btnAgregar.style.display = 'inline-flex';
        if (spanE) { spanE.textContent = ""; }
    }
}

export function poblarDisponibilidadMultiRango(disp = {}, esProfe = false, hApe = '09:00', hCie = '22:00') {
    const prefix = esProfe ? 'disp-p-' : 'disp-';
    const estadoPrefix = esProfe ? 'estado-p-' : 'estado-';
    
    diasSemana.forEach(dia => {
        const dD = disp[dia.id] || [];
        const rangosCont = document.getElementById(`rangos-${prefix}${dia.id}`);
        const cA = document.getElementById(`${prefix}${dia.id}-all`);
        const cN = document.getElementById(`${prefix}${dia.id}-none`);
        const sE = document.getElementById(`${estadoPrefix}${dia.id}`);
        
        if (!rangosCont) return;
        rangosCont.innerHTML = '';
        if (cA) cA.checked = false;
        if (cN) cN.checked = false;
        if (sE) sE.textContent = "";
        
        if (dD.length === 0) {
            if (cN) cN.checked = true;
            rangosCont.innerHTML = crearFilaRangoHTML(dia.id, '', '', esProfe, 0);
        } else if (dD.length === 1 && dD[0].inicio === hApe && dD[0].fin === hCie) {
            if (cA) cA.checked = true;
            rangosCont.innerHTML = crearFilaRangoHTML(dia.id, '', '', esProfe, 0);
        } else {
            dD.forEach((rango, idx) => {
                rangosCont.innerHTML += crearFilaRangoHTML(dia.id, rango.inicio || '', rango.fin || '', esProfe, idx);
            });
        }
        actualizarBotonesQuitarRango(dia.id, esProfe);
        updateDispStateForDay(dia.id, esProfe);
    });
}

export function extraerDisponibilidadMultiRango(esProfe = false, hApe = '09:00', hCie = '22:00') {
    const prefix = esProfe ? 'disp-p-' : 'disp-';
    const disp = {};
    diasSemana.forEach(d => {
        const cA = document.getElementById(`${prefix}${d.id}-all`)?.checked;
        const cN = document.getElementById(`${prefix}${d.id}-none`)?.checked;
        if (cN) {
            disp[d.id] = [];
        } else if (cA) {
            disp[d.id] = [{ inicio: hApe, fin: hCie }];
        } else {
            const rangosCont = document.getElementById(`rangos-${prefix}${d.id}`);
            const items = rangosCont ? rangosCont.querySelectorAll('.rango-item') : [];
            const arr = [];
            items.forEach(item => {
                const i = item.querySelector('.rango-inicio')?.value || '';
                const f = item.querySelector('.rango-fin')?.value || '';
                if (i || f) {
                    arr.push({ inicio: i || hApe, fin: f || hCie });
                }
            });
            disp[d.id] = arr;
        }
    });
    return disp;
}

window.updateDispStateForDay = updateDispStateForDay;
window.poblarDisponibilidadMultiRango = poblarDisponibilidadMultiRango;
window.extraerDisponibilidadMultiRango = extraerDisponibilidadMultiRango;
