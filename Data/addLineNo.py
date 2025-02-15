import csv
import os
from pathlib import Path

def process_csv_with_line_number_inplace(file_path, new_column="行号"):
    # 构造临时文件路径
    temp_file = file_path.with_suffix(file_path.suffix + ".tmp")
    with open(file_path, encoding="utf-8-sig", newline="") as fin, \
         open(temp_file, mode="w", encoding="utf-8-sig", newline="") as fout:
        reader = csv.DictReader(fin)
        original_headers = reader.fieldnames
        new_headers = original_headers + [new_column]
        writer = csv.DictWriter(fout, fieldnames=new_headers)
        writer.writeheader()
        for idx, row in enumerate(reader, start=1):
            row[new_column] = str(idx)
            writer.writerow(row)
    # 用临时文件替换原文件
    os.replace(temp_file, file_path)

if __name__ == '__main__':
    # 假设 CSV 文件在 Data 文件夹中
    input_dir = Path(".")
    for filename in ["actors.csv", "movies.csv", "directors.csv"]:
         file_path = input_dir / filename
         process_csv_with_line_number_inplace(file_path)
    print("CSV files processed and overwritten successfully.")
