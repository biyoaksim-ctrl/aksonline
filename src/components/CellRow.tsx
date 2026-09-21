import type { MeetCell } from "../types";
import { meetCode } from "../lib/meet";
import { Ico } from "./icons";

interface Props {
  cell: MeetCell;
  inLane: boolean;
  laneNo: number;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenLane: () => void;
  onCloseLane: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

export default function CellRow(p: Props) {
  const { cell } = p;
  return (
    <section className={`cell-row ${p.inLane ? "is-open" : ""} ${p.selected ? "is-selected" : ""}`} style={{ borderLeftColor: cell.color }}>
      <div className="cell-row-main">
        <button className={`selection-box ${p.selected ? "checked" : ""}`} onClick={p.onToggleSelect} aria-label={`${cell.name} panelini seç`} aria-pressed={p.selected}>{p.selected && <Ico.Check className="h-3 w-3" />}</button>
        <div className="cell-row-title"><h3>{cell.name}</h3><span className="code">{meetCode(cell.url) || "Bağlantı ekleyin"}</span></div>
        <span className="cell-row-number">{p.inLane ? String(p.laneNo).padStart(2, "0") : ""}</span>
      </div>
      <div className="cell-row-footer">
        <span className="cell-row-meta">{cell.example ? "Örnek" : cell.openedAt ? "Oda açık" : "Hazır"}</span>
        <button className="icon-button small" onClick={p.onEdit} title="Paneli düzenle" aria-label={`${cell.name} panelini düzenle`}><Ico.Notes className="h-3 w-3" /></button>
        <button className="icon-button small danger-hover" onClick={p.onRemove} title="Paneli sil" aria-label={`${cell.name} panelini sil`}><Ico.Trash className="h-3 w-3" /></button>
        <button className={`row-open-button ${p.inLane ? "opened" : ""}`} onClick={p.inLane ? p.onCloseLane : p.onOpenLane} title={p.inLane ? "Yalnızca yerel çerçeveyi kapat" : "Sağda bağımsız çerçeve aç"}>
          {p.inLane ? <><Ico.X className="h-3 w-3" />Kapat</> : <><Ico.Play className="h-3 w-3" />Sağda aç</>}
        </button>
      </div>
    </section>
  );
}