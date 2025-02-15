import csv
import re

def process_release_date(date_str):
    """
    处理上映时间字段：
    - 如果字符串为 None 或空或“未知上映时间”，返回空字符串
    - 否则，使用正则表达式提取符合 YYYY-MM-DD 格式的部分
    """
    if not date_str or date_str.strip() == "未知上映时间":
        return ""
    match = re.search(r"(\d{4}-\d{2}-\d{2})", date_str)
    if match:
        return match.group(1)
    return ""

def standardize_actor_list(actor_str):
    """
    处理演员列表字段：
    将中文逗号（，）替换为顿号（、），并去除首尾空格
    """
    if not actor_str:
        return ""
    # 替换中文逗号为顿号
    standardized = actor_str.replace("，", "、")
    # 如果需要进一步处理（例如去掉多余空格），可按需处理
    return standardized.strip()

def preprocess_movies_csv(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as fin, \
         open(output_file, 'w', newline='', encoding='utf-8') as fout:
        
        reader = csv.DictReader(fin)
        fieldnames = reader.fieldnames
        writer = csv.DictWriter(fout, fieldnames=fieldnames)
        
        # 写入表头
        writer.writeheader()
        
        for row in reader:
            # 处理上映时间字段
            original_date = row.get("上映时间", "")
            row["上映时间"] = process_release_date(original_date)
            
            # 统一演员列表分隔符（将中文逗号替换为顿号）
            original_actors = row.get("演员", "")
            row["演员"] = standardize_actor_list(original_actors)
            
            # 如果需要，也可以对导演列表进行类似处理，这里示例如下（可选）：
            original_directors = row.get("导演", "")
            row["导演"] = original_directors.replace("，", "、").strip() if original_directors else ""
            
            writer.writerow(row)

if __name__ == '__main__':
    # 输入文件路径（你的原始 movies.csv 文件）
    input_file = 'Data/movies.csv'      # 根据实际情况修改路径
    # 输出文件路径（预处理后的 CSV 文件）
    output_file = 'Data/movies_processed.csv'
    
    preprocess_movies_csv(input_file, output_file)
    print("预处理完成，处理后的数据已写入", output_file)
