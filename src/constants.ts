import type { WordTypeInfo, HighlightColor } from './types'

export const WORD_TYPES: WordTypeInfo[] = [
  { key:'名词',   vi:'Danh từ',      color:'#1A4BD8', bg:'#EEF4FF' },
  { key:'动词',   vi:'Động từ',      color:'#C8281E', bg:'#FEE8E6' },
  { key:'形容词', vi:'Tính từ',      color:'#177A47', bg:'#E8F5EE' },
  { key:'代词',   vi:'Đại từ',       color:'#7C3AED', bg:'#F5F3FF' },
  { key:'数词',   vi:'Số từ',        color:'#A0510D', bg:'#FEF3C7' },
  { key:'量词',   vi:'Lượng từ',     color:'#0E7490', bg:'#E0F7FA' },
  { key:'副词',   vi:'Phó từ',       color:'#BE185D', bg:'#FCE7F3' },
  { key:'介词',   vi:'Giới từ',      color:'#065F46', bg:'#D1FAE5' },
  { key:'连词',   vi:'Liên từ',      color:'#92400E', bg:'#FEF9C3' },
  { key:'助词',   vi:'Trợ từ',       color:'#1E40AF', bg:'#DBEAFE' },
  { key:'叹词',   vi:'Thán từ',      color:'#9D174D', bg:'#FCE7F3' },
  { key:'拟声词', vi:'Tượng thanh',  color:'#3D6B00', bg:'#ECFCCB' },
  { key:'语气词', vi:'Ngữ khí từ',   color:'#6B21A8', bg:'#FAF5FF' },
  { key:'词组',   vi:'Cụm từ',       color:'#374151', bg:'#F3F4F6' },
]

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { key:'yellow', label:'Vàng',      bg:'#FEF08A', text:'#713F12', dot:'#EAB308' },
  { key:'green',  label:'Xanh lá',   bg:'#BBF7D0', text:'#14532D', dot:'#16A34A' },
  { key:'blue',   label:'Xanh',      bg:'#BAE6FD', text:'#0C4A6E', dot:'#0284C7' },
  { key:'purple', label:'Tím',       bg:'#E9D5FF', text:'#4C1D95', dot:'#9333EA' },
  { key:'orange', label:'Cam',       bg:'#FED7AA', text:'#7C2D12', dot:'#EA580C' },
]

export const DEP_ROLES: Record<string, { vi: string; color: string }> = {
  subject:    { vi: 'Chủ ngữ',          color: '#2563eb' },
  predicate:  { vi: 'Vị ngữ',           color: '#dc2626' },
  object:     { vi: 'Tân ngữ',          color: '#16a34a' },
  complement: { vi: 'Bổ ngữ',           color: '#d97706' },
  modifier:   { vi: 'Trạng / Định ngữ', color: '#8b5cf6' },
}
