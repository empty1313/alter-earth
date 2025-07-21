# --- START OF FILE DB_editor_v2.5.py ---

import sys
import os
import re
import csv
import io
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                             QTextEdit, QPushButton, QTableWidget, QTableWidgetItem, 
                             QTabWidget, QAction, QFileDialog, QMessageBox, QStatusBar, QLabel,
                             QGridLayout, QHeaderView, QInputDialog) # QInputDialog 추가
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QFont, QColor, QBrush

# 경로 및 파일 처리 순서를 상수로 관리
DATABASE_DIR = "../database"
FILE_PROCESSING_ORDER = [
    'gates.csv', 'rooms.csv', 'connectors.csv', 'details.csv', 
    'elements.csv', 'scenarios.csv', 'monster.csv', 'item.csv', 
    'event.csv', 'protocols.csv'
]


# 스타일시트 (변경 없음)
STYLESHEET = """
QWidget {
    font-family: 'Malgun Gothic';
    font-size: 10pt;
}
QMainWindow, QWidget {
    background-color: #2E2E2E;
    color: #E0E0E0;
}
QTableWidget {
    background-color: #222222;
    gridline-color: #444444;
    color: #E0E0E0;
    selection-background-color: #555555;
}
QHeaderView::section {
    background-color: #383838;
    color: #E0E0E0;
    padding: 4px;
    border: 1px solid #555555;
}
QTabWidget::pane {
    border: 1px solid #444444;
}
QTabBar::tab {
    background: #383838;
    color: #E0E0E0;
    padding: 8px 15px;
    border: 1px solid #444444;
    border-bottom: none;
}
QTabBar::tab:selected {
    background: #4A4A4A;
}
QTabBar::tab:!selected:hover {
    background: #404040;
}
QPushButton {
    background-color: #4A4A4A;
    border: 1px solid #666666;
    padding: 8px;
    border-radius: 4px;
}
QPushButton:hover {
    background-color: #5A5A5A;
}
QPushButton:pressed {
    background-color: #404040;
}
QPushButton:disabled {
    background-color: #333333;
    color: #888888;
}
QTextEdit, QLineEdit {
    background-color: #222222;
    border: 1px solid #555555;
    padding: 5px;
    color: #E0E0E0;
}
QMessageBox {
    background-color: #2E2E2E;
}
QInputDialog {
    background-color: #2E2E2E;
    color: #E0E0E0;
}
"""

class IDManager:
    """ID 관리 클래스 (변경 없음)"""
    def get_next_number(self, filepath, prefix, id_column_header='ID'):
        max_num = 0
        try:
            if not os.path.exists(filepath): return 1
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read().strip()
                if not content: return 1
                f.seek(0)
                
                reader = csv.reader(f)
                header = next(reader, None)
                if not header: return 1
                
                try: id_index = header.index(id_column_header)
                except ValueError: return 1

                for row in reader:
                    if not row or len(row) <= id_index: continue
                    
                    cell_value = row[id_index]
                    if cell_value and cell_value.startswith(prefix):
                        id_suffix = cell_value[len(prefix):]
                        num_part = ''.join(filter(str.isdigit, id_suffix))
                        if num_part: max_num = max(max_num, int(num_part))
            return max_num + 1
        except (FileNotFoundError, StopIteration): return 1
        except Exception as e:
            print(f"Error reading {filepath} for prefix {prefix}: {e}")
            return 1

    def get_next_index(self, filepath):
        try:
            if not os.path.exists(filepath): return 1
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read().strip()
                if not content: return 1
                f.seek(0)

                reader = csv.reader(f)
                next(reader, None)
                indices = [int(row[0]) for row in reader if row and row[0].isdigit()]
                return max(indices) + 1 if indices else 1
        except (FileNotFoundError, StopIteration): return 1
        except Exception as e:
            print(f"Error reading index from {filepath}: {e}")
            return 1

class DBEditorApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.id_manager = IDManager()
        self.initUI()

    def initUI(self):
        self.setWindowTitle('ARACHNE & M.A.R.S. DB Editor v2.5') # [v2.5 변경] 버전 업데이트
        self.setGeometry(100, 100, 1600, 900)
        self.setStyleSheet(STYLESHEET)

        main_tabs = QTabWidget()
        self.importer_widget = QWidget()
        self.editor_widget = QWidget()
        
        main_tabs.addTab(self.importer_widget, "데이터 임포터 (AI 데이터 신규 추가)")
        main_tabs.addTab(self.editor_widget, "DB 직접 편집기 (기존 파일 수정)")

        self.initImporterUI()
        self.initEditorUI()

        self.setCentralWidget(main_tabs)
        
        self.statusBar = QStatusBar()
        self.setStatusBar(self.statusBar)
        self.statusBar.showMessage("준비 완료. AI 생성 데이터를 붙여넣고 미리보기를 실행하세요.")

    def initImporterUI(self):
        # (데이터 임포터 UI 로직, 변경 없음)
        layout = QHBoxLayout(self.importer_widget)
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        left_panel.setFixedWidth(450)
        importer_title = QLabel("ARACHNE & M.A.R.S. 데이터 임포터")
        importer_title.setStyleSheet("font-size: 14pt; font-weight: bold; margin-bottom: 10px;")
        self.prompt_input = QTextEdit()
        self.prompt_input.setPlaceholderText("이곳에 AI가 생성한 게이트 정보 전체를 붙여넣으세요...")
        self.preview_button = QPushButton("1. 데이터 미리보기 및 ID 생성")
        self.importer_save_button = QPushButton("2. 데이터베이스에 저장")
        self.importer_save_button.setEnabled(False)
        left_layout.addWidget(importer_title)
        left_layout.addWidget(self.prompt_input)
        left_layout.addWidget(self.preview_button)
        left_layout.addWidget(self.importer_save_button)
        self.preview_button.clicked.connect(self.run_preview)
        self.importer_save_button.clicked.connect(self.save_importer_data_to_db)
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        preview_title = QLabel("데이터 미리보기")
        preview_title.setStyleSheet("font-size: 12pt; font-weight: bold;")
        self.importer_tab_widget = QTabWidget()
        right_layout.addWidget(preview_title)
        right_layout.addWidget(self.importer_tab_widget)
        layout.addWidget(left_panel)
        layout.addWidget(right_panel)

    def parse_prompt_output(self, text):
        # (데이터 파싱 로직, 변경 없음)
        pattern = re.compile(r"(?:\*\*)?(\w+\.csv(?: \([^)]+\))?)(?:\*\*)?\n```csv\n(.*?)\n```", re.DOTALL)
        raw_matches = pattern.findall(text)
        parsed_data = {raw_filename.split(' ')[0]: content.strip() for raw_filename, content in raw_matches}
        if not parsed_data:
            QMessageBox.warning(self, "파싱 오류", "입력된 텍스트에서 CSV 데이터를 찾을 수 없습니다. 형식을 확인해주세요.")
            return None
        return parsed_data

    def get_prefix(self, placeholder_id):
        # (ID 프리픽스 추출 로직, 변경 없음)
        match = re.match(r"([A-Z]{1,3}-)", placeholder_id)
        if match:
            return match.group(1)
        return None

    def run_preview(self):
        # (미리보기 실행 로직, 변경 없음)
        self.statusBar.showMessage("데이터 파싱 및 ID 생성 시작...")
        QApplication.processEvents()
        
        prompt_text = self.prompt_input.toPlainText()
        if not prompt_text:
            self.statusBar.showMessage("오류: 입력된 내용이 없습니다."); return

        parsed_sections = self.parse_prompt_output(prompt_text)
        if not parsed_sections: return

        self.importer_tab_widget.clear()
        id_map = {}
        processed_data = {}

        try:
            self.statusBar.showMessage("Pass 1/2: 고유 ID 생성 및 매핑 중...")
            QApplication.processEvents()

            gate_id_num = self.id_manager.get_next_number(os.path.join(DATABASE_DIR, 'gates.csv'), 'G-', 'id')
            new_gate_id = f"G-{gate_id_num:03d}"
            
            prefixes = ['M-ETC', 'R-', 'E-', 'S-', 'I-', 'EV-', 'T-', 'SCN-']
            id_col_map = {'scenarios.csv': 'id', 'gates.csv': 'id'}
            file_map = {'M-ETC': 'monster.csv', 'R-': 'item.csv', 'E-': 'item.csv', 'S-': 'item.csv', 'I-': 'item.csv', 'EV-': 'event.csv', 'T-': 'event.csv', 'SCN-': 'scenarios.csv'}
            
            next_id_counters = {
                prefix: self.id_manager.get_next_number(
                    os.path.join(DATABASE_DIR, file_map[prefix]),
                    prefix,
                    id_col_map.get(file_map[prefix], 'ID')
                ) for prefix in prefixes
            }
            
            core_id_files = ['gates.csv', 'monster.csv', 'item.csv', 'event.csv', 'scenarios.csv']
            for filename in core_id_files:
                if filename not in parsed_sections: continue
                
                reader = csv.reader(io.StringIO(parsed_sections[filename]))
                header = next(reader)
                
                id_col_header = 'id' if filename in ['gates.csv', 'scenarios.csv'] else 'ID'
                id_col_idx = header.index(id_col_header)
                category_col_idx = header.index('category') if 'category' in header else -1

                for row in reader:
                    if not row: continue
                    placeholder_id = row[id_col_idx]
                    new_id = ""
                    
                    if filename == 'gates.csv':
                        new_id = new_gate_id
                    elif filename == 'monster.csv':
                        is_boss = category_col_idx != -1 and row[category_col_idx] == 'boss'
                        if is_boss:
                            boss_match = re.match(r"(B-)(G\d{3}|G-?00X)(-[\w]+)", placeholder_id, re.IGNORECASE)
                            if boss_match:
                                prefix, _, suffix = boss_match.groups()
                                new_id = f"{prefix}{new_gate_id.replace('-', '')}{suffix}"
                            else: 
                                new_id = placeholder_id
                                print(f"Warning: Boss ID '{placeholder_id}' in monster.csv does not match expected pattern B-G###-TYPE.")
                        else:
                            prefix = 'M-ETC'
                            new_id = f"{prefix}{next_id_counters[prefix]:03d}"
                            next_id_counters[prefix] += 1
                    else:
                        prefix = self.get_prefix(placeholder_id)
                        if prefix and prefix in next_id_counters:
                            new_id = f"{prefix}{next_id_counters[prefix]:03d}"
                            next_id_counters[prefix] += 1
                        else:
                            new_id = placeholder_id 
                            if prefix: print(f"Warning: Unknown prefix '{prefix}' for ID '{placeholder_id}' in {filename}")

                    if new_id and placeholder_id != new_id:
                        id_map[placeholder_id] = new_id

            self.statusBar.showMessage("Pass 2/2: 참조(Foreign Key) 및 설명 필드 교체 중...")
            QApplication.processEvents()
            
            for filename in FILE_PROCESSING_ORDER:
                if filename not in parsed_sections: continue
                
                reader = csv.reader(io.StringIO(parsed_sections[filename]))
                header = next(reader)
                final_rows = []
                for row in reader:
                    new_row = list(row)
                    id_col_header = 'id' if filename in ['gates.csv', 'scenarios.csv'] else 'ID'
                    if id_col_header in header:
                        id_col_idx = header.index(id_col_header)
                        if new_row[id_col_idx] in id_map:
                            new_row[id_col_idx] = id_map[new_row[id_col_idx]]

                    for i, cell in enumerate(new_row):
                        updated_cell = cell
                        placeholders_in_cell = re.findall(r"([A-Z]{1,3}-[\w-]+)", updated_cell)
                        for p_id in placeholders_in_cell:
                            if p_id in id_map:
                                updated_cell = updated_cell.replace(p_id, id_map[p_id])
                        
                        updated_cell = updated_cell.replace('G-00X', new_gate_id)
                        new_row[i] = updated_cell
                    final_rows.append(new_row)
                
                table = QTableWidget()
                table.setColumnCount(len(header))
                table.setHorizontalHeaderLabels(header)
                next_idx = self.id_manager.get_next_index(os.path.join(DATABASE_DIR, filename))
                
                for row_data in final_rows:
                    row_pos = table.rowCount()
                    table.insertRow(row_pos)
                    if 'index' in header and header[0] == 'index':
                        table.setItem(row_pos, 0, QTableWidgetItem(str(next_idx)))
                        for col_idx, cell_data in enumerate(row_data[1:]):
                            table.setItem(row_pos, col_idx + 1, QTableWidgetItem(cell_data))
                        next_idx += 1
                    else:
                        for col_idx, cell_data in enumerate(row_data):
                            table.setItem(row_pos, col_idx, QTableWidgetItem(cell_data))

                table.resizeColumnsToContents()
                table.horizontalHeader().setSectionResizeMode(QHeaderView.Interactive)
                self.importer_tab_widget.addTab(table, filename)
            
            self.importer_save_button.setEnabled(True)
            self.statusBar.showMessage("✅ 미리보기 및 ID 생성 완료. 최종 확인 후 저장하세요.")

        except Exception as e:
            QMessageBox.critical(self, "처리 오류", f"데이터 처리 중 오류가 발생했습니다:\n{e}\n\n입력 데이터나 DB 파일 형식을 확인해주세요.")
            self.statusBar.showMessage(f"🚨 처리 중 오류 발생: {e}")

    def save_importer_data_to_db(self):
        # (데이터 저장 로직, 변경 없음)
        reply = QMessageBox.question(self, 'DB에 저장', "미리보기의 데이터를 DB에 추가하시겠습니까?\n이 작업은 되돌릴 수 없습니다.", QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if reply == QMessageBox.No: return
        
        if not os.path.exists(DATABASE_DIR): os.makedirs(DATABASE_DIR)

        for filename in FILE_PROCESSING_ORDER:
            table = None
            for i in range(self.importer_tab_widget.count()):
                if self.importer_tab_widget.tabText(i) == filename:
                    table = self.importer_tab_widget.widget(i)
                    break
            
            if table is None: continue

            filepath = os.path.join(DATABASE_DIR, filename)
            header = [table.horizontalHeaderItem(j).text() for j in range(table.columnCount())]
            rows_to_append = [[table.item(r, c).text() for c in range(table.columnCount())] for r in range(table.rowCount())]
            
            file_exists = os.path.exists(filepath) and os.path.getsize(filepath) > 0
            
            try:
                with open(filepath, 'a', newline='', encoding='utf-8') as f:
                    writer = csv.writer(f)
                    if not file_exists:
                        writer.writerow(header)
                    writer.writerows(rows_to_append)
            except IOError as e:
                QMessageBox.critical(self, "파일 쓰기 오류", f"'{filename}' 파일에 쓰는 중 오류 발생:\n{e}")
                self.statusBar.showMessage(f"🚨 '{filename}' 저장 실패.")
                return

        QMessageBox.information(self, "저장 완료", f"데이터가 DB에 성공적으로 추가되었습니다.")
        self.prompt_input.clear()
        self.importer_tab_widget.clear()
        self.importer_save_button.setEnabled(False)
        self.statusBar.showMessage("저장 완료. 새 작업을 시작할 수 있습니다.")

    # ===================================================================
    # 2. DB 직접 편집기 UI 및 로직 (일부 변경)
    # ===================================================================
    def initEditorUI(self):
        layout = QVBoxLayout(self.editor_widget)
        
        # [v2.5 변경] 버튼 레이아웃 수정
        top_button_layout = QHBoxLayout()
        btn_open = QPushButton("파일 열기")
        btn_save = QPushButton("현재 파일 저장")
        btn_save_all = QPushButton("모두 저장")
        top_button_layout.addWidget(btn_open)
        top_button_layout.addWidget(btn_save)
        top_button_layout.addWidget(btn_save_all)
        top_button_layout.addStretch(1)

        bottom_button_layout = QHBoxLayout()
        btn_add_row = QPushButton("행 추가")
        btn_del_row = QPushButton("선택 행 삭제")
        btn_cascade_delete = QPushButton("게이트 일괄 삭제") # [v2.5 추가]
        btn_cascade_delete.setStyleSheet("background-color: #8B0000; color: white;") # 위험한 작업임을 강조

        bottom_button_layout.addStretch(1)
        bottom_button_layout.addWidget(btn_add_row)
        bottom_button_layout.addWidget(btn_del_row)
        bottom_button_layout.addWidget(btn_cascade_delete)

        # 버튼 연결
        btn_open.clicked.connect(self.open_files_for_editing)
        btn_save.clicked.connect(self.save_current_file)
        btn_save_all.clicked.connect(self.save_all_files)
        btn_add_row.clicked.connect(self.add_row_to_current_table)
        btn_del_row.clicked.connect(self.delete_rows_from_current_table)
        btn_cascade_delete.clicked.connect(self.cascade_delete_gate) # [v2.5 추가]
        
        self.editor_tab_widget = QTabWidget()
        self.editor_tab_widget.setTabsClosable(True)
        self.editor_tab_widget.tabCloseRequested.connect(self.close_editor_tab)

        layout.addLayout(top_button_layout)
        layout.addWidget(self.editor_tab_widget)
        layout.addLayout(bottom_button_layout)


    def open_files_for_editing(self):
        # (파일 열기 로직, 변경 없음)
        filepaths, _ = QFileDialog.getOpenFileNames(self, "DB 파일 열기", DATABASE_DIR, "CSV Files (*.csv)")
        if filepaths:
            for path in filepaths: self.load_csv_to_new_tab(path)

    def load_csv_to_new_tab(self, filepath):
        # (CSV 로드 로직, 변경 없음)
        try:
            filename = os.path.basename(filepath)
            for i in range(self.editor_tab_widget.count()):
                if self.editor_tab_widget.widget(i).property("filepath") == filepath:
                    self.editor_tab_widget.setCurrentIndex(i)
                    self.statusBar.showMessage(f"'{filename}' 파일은 이미 열려있습니다.")
                    return
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                reader = csv.reader(f)
                header, rows = next(reader), list(reader)
            table = QTableWidget(); table.setRowCount(len(rows)); table.setColumnCount(len(header))
            table.setHorizontalHeaderLabels(header)
            for r, row_data in enumerate(rows):
                for c, cell_data in enumerate(row_data): table.setItem(r, c, QTableWidgetItem(cell_data))
            table.horizontalHeader().setSectionResizeMode(QHeaderView.Interactive); table.resizeColumnsToContents()
            table.setProperty("filepath", filepath); table.setProperty("is_modified", False)
            table.itemChanged.connect(self.mark_tab_as_modified)
            idx = self.editor_tab_widget.addTab(table, filename)
            self.editor_tab_widget.setCurrentIndex(idx)
            self.statusBar.showMessage(f"'{filename}' 파일을 불러왔습니다.")
        except Exception as e:
            QMessageBox.critical(self, "파일 열기 오류", f"'{os.path.basename(filepath)}' 파일을 여는 중 오류가 발생했습니다:\n{e}")

    def mark_tab_as_modified(self, item):
        # (탭 수정 표시 로직, 변경 없음)
        table = item.tableWidget()
        if not table.property("is_modified"):
            table.setProperty("is_modified", True); idx = self.editor_tab_widget.indexOf(table)
            current_text = self.editor_tab_widget.tabText(idx)
            if not current_text.endswith('*'): self.editor_tab_widget.setTabText(idx, current_text + '*')
    
    def save_table_to_file(self, table_widget, filepath):
        # (테이블 저장 로직, 변경 없음)
        try:
            with open(filepath, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                header = [table_widget.horizontalHeaderItem(j).text() for j in range(table_widget.columnCount())]
                writer.writerow(header)
                for r in range(table_widget.rowCount()):
                    row_data = [table_widget.item(r, c).text() if table_widget.item(r, c) else "" for c in range(table_widget.columnCount())]
                    writer.writerow(row_data)
            table_widget.setProperty("is_modified", False); idx = self.editor_tab_widget.indexOf(table_widget)
            current_text = self.editor_tab_widget.tabText(idx)
            if current_text.endswith('*'): self.editor_tab_widget.setTabText(idx, current_text[:-1])
            self.statusBar.showMessage(f"✅ '{os.path.basename(filepath)}' 파일이 저장되었습니다.")
            return True
        except IOError as e:
            QMessageBox.critical(self, "저장 오류", f"파일 저장 중 오류 발생:\n{e}")
            self.statusBar.showMessage(f"🚨 '{os.path.basename(filepath)}' 파일 저장 실패.")
            return False

    def save_current_file(self):
        # (현재 파일 저장 로직, 변경 없음)
        current_table = self.editor_tab_widget.currentWidget()
        if isinstance(current_table, QTableWidget):
            self.save_table_to_file(current_table, current_table.property("filepath"))
        else: self.statusBar.showMessage("저장할 파일이 없습니다.")

    def save_all_files(self):
        # (모든 파일 저장 로직, 변경 없음)
        saved_count = 0; total_count = self.editor_tab_widget.count()
        if total_count == 0: self.statusBar.showMessage("저장할 파일이 없습니다."); return
        for i in range(total_count):
            table = self.editor_tab_widget.widget(i)
            if table.property("is_modified"):
                if self.save_table_to_file(table, table.property("filepath")): saved_count += 1
        self.statusBar.showMessage(f"✅ 수정된 파일 {saved_count}개를 모두 저장했습니다.")
    
    def close_editor_tab(self, index):
        # (탭 닫기 로직, 변경 없음)
        table = self.editor_tab_widget.widget(index)
        if table.property("is_modified"):
            filename = os.path.basename(table.property("filepath"))
            reply = QMessageBox.question(self, '변경사항 저장', f"'{filename}' 파일에 저장하지 않은 변경사항이 있습니다.\n저장하시겠습니까?",
                                       QMessageBox.Yes | QMessageBox.No | QMessageBox.Cancel, QMessageBox.Cancel)
            if reply == QMessageBox.Yes:
                if not self.save_table_to_file(table, table.property("filepath")): return
            elif reply == QMessageBox.Cancel: return
        self.editor_tab_widget.removeTab(index)

    def add_row_to_current_table(self):
        # (행 추가 로직, 변경 없음)
        current_table = self.editor_tab_widget.currentWidget()
        if isinstance(current_table, QTableWidget):
            row_count = current_table.rowCount()
            current_table.insertRow(row_count)
            self.statusBar.showMessage(f"테이블에 새 행을 추가했습니다 (총 {row_count + 1} 행).")

    def delete_rows_from_current_table(self):
        # (행 삭제 로직, 변경 없음)
        current_table = self.editor_tab_widget.currentWidget()
        if isinstance(current_table, QTableWidget):
            selected_rows = sorted(list(set(item.row() for item in current_table.selectedItems())), reverse=True)
            if not selected_rows:
                QMessageBox.warning(self, "선택 오류", "삭제할 행을 먼저 선택해주세요.")
                return
            reply = QMessageBox.question(self, '행 삭제 확인', f"{len(selected_rows)}개의 행을 정말로 삭제하시겠습니까?",
                                       QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
            if reply == QMessageBox.Yes:
                for row_index in selected_rows: current_table.removeRow(row_index)
                self.statusBar.showMessage(f"{len(selected_rows)}개의 행을 삭제했습니다.")

    # [v2.5 추가] 게이트 일괄 삭제 기능
    def cascade_delete_gate(self):
        gate_id_to_delete, ok = QInputDialog.getText(self, '게이트 일괄 삭제', '삭제할 게이트의 ID를 입력하세요 (예: G-001):')
        
        if not ok or not gate_id_to_delete:
            self.statusBar.showMessage("게이트 삭제 작업이 취소되었습니다.")
            return

        if not re.match(r"^G-\d{3}$", gate_id_to_delete):
            QMessageBox.warning(self, "입력 오류", "게이트 ID 형식이 올바르지 않습니다.\n'G-숫자3자리' 형식으로 입력해주세요 (예: G-001).")
            return

        reply = QMessageBox.question(self, '최종 확인', 
                                     f"정말로 게이트 '{gate_id_to_delete}'와 관련된 모든 데이터를 DB에서 영구적으로 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다!",
                                     QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if reply == QMessageBox.No:
            self.statusBar.showMessage("게이트 삭제 작업이 취소되었습니다.")
            return

        self.statusBar.showMessage(f"게이트 '{gate_id_to_delete}' 삭제 작업 시작...")
        QApplication.processEvents()
        
        try:
            # 1단계: 삭제할 관련 ID 목록 수집
            rooms_to_delete = set()
            boss_monsters_to_delete = set()
            boss_gate_id_str = gate_id_to_delete.replace('-', '') # B-G001-MAIN 형식 비교용

            # rooms.csv에서 관련 room id 수집
            rooms_file = os.path.join(DATABASE_DIR, 'rooms.csv')
            if os.path.exists(rooms_file):
                with open(rooms_file, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        if row.get('GID') == gate_id_to_delete:
                            rooms_to_delete.add(row.get('id'))
            
            # monster.csv에서 관련 보스 id 수집
            monster_file = os.path.join(DATABASE_DIR, 'monster.csv')
            if os.path.exists(monster_file):
                with open(monster_file, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        monster_id = row.get('ID', '')
                        if monster_id.startswith(f"B-{boss_gate_id_str}-"):
                            boss_monsters_to_delete.add(monster_id)

            # 2단계: 파일들을 순회하며 데이터 삭제
            modified_files = []
            for filename in FILE_PROCESSING_ORDER:
                filepath = os.path.join(DATABASE_DIR, filename)
                if not os.path.exists(filepath): continue

                rows_to_keep = []
                header = []
                is_modified = False
                
                with open(filepath, 'r', encoding='utf-8') as f:
                    reader = csv.reader(f)
                    header = next(reader)
                    rows_to_keep.append(header)
                    
                    dict_reader = csv.DictReader(io.StringIO('\n'.join(','.join(row) for row in csv.reader(open(filepath, 'r', encoding='utf-8')))))
                    # 위 방식은 복잡. 간단하게 인덱스로 처리.
                    
                    # 파일 헤더를 기준으로 판단할 컬럼의 인덱스 찾기
                    gid_idx = header.index('GID') if 'GID' in header else -1
                    gate_id_idx = header.index('id') if 'id' in header else -1
                    room_id_idx = header.index('RoomID') if 'RoomID' in header else -1
                    monster_id_idx = header.index('MonsterID') if 'MonsterID' in header else -1
                    monster_id_col_idx = header.index('ID') if 'ID' in header else -1

                    f.seek(0)
                    next(f) # 헤더 건너뛰기
                    
                    for row in csv.reader(f):
                        if not row: continue
                        keep_row = True
                        
                        # 각 파일의 특성에 맞게 삭제 조건 검사
                        if filename == 'gates.csv' and gate_id_idx != -1:
                            if row[gate_id_idx] == gate_id_to_delete: keep_row = False
                        elif gid_idx != -1:
                            if row[gid_idx] == gate_id_to_delete: keep_row = False
                        elif room_id_idx != -1:
                            if row[room_id_idx] in rooms_to_delete: keep_row = False
                        elif monster_id_idx != -1:
                            if row[monster_id_idx] in boss_monsters_to_delete: keep_row = False
                        elif filename == 'monster.csv' and monster_id_col_idx != -1:
                            if row[monster_id_col_idx] in boss_monsters_to_delete: keep_row = False
                        
                        if keep_row:
                            rows_to_keep.append(row)
                        else:
                            is_modified = True

                if is_modified:
                    with open(filepath, 'w', newline='', encoding='utf-8') as f:
                        writer = csv.writer(f)
                        writer.writerows(rows_to_keep)
                    modified_files.append(filename)
            
            # 3단계: 결과 알림
            if modified_files:
                QMessageBox.information(self, "삭제 완료", 
                                          f"게이트 '{gate_id_to_delete}'와 관련된 데이터 삭제가 완료되었습니다.\n\n"
                                          f"수정된 파일:\n- " + "\n- ".join(modified_files) +
                                          "\n\n열려있는 탭이 있다면, 닫고 다시 열어 변경사항을 확인하세요.")
                self.statusBar.showMessage(f"✅ 게이트 '{gate_id_to_delete}' 삭제 완료.")
            else:
                QMessageBox.information(self, "결과", f"'{gate_id_to_delete}' ID를 가진 게이트를 찾을 수 없거나 관련 데이터가 없습니다.")
                self.statusBar.showMessage(f"'{gate_id_to_delete}'에 해당하는 데이터를 찾을 수 없습니다.")

        except Exception as e:
            QMessageBox.critical(self, "오류", f"일괄 삭제 작업 중 오류가 발생했습니다:\n{e}")
            self.statusBar.showMessage(f"🚨 게이트 일괄 삭제 중 오류 발생.")


if __name__ == '__main__':
    if not os.path.exists(DATABASE_DIR):
        os.makedirs(DATABASE_DIR)
        print(f"'{DATABASE_DIR}' 디렉토리가 없어 새로 생성했습니다.")

    app = QApplication(sys.argv)
    ex = DBEditorApp()
    ex.show()
    sys.exit(app.exec_())

# --- END OF FILE DB_editor_v2.5.py ---