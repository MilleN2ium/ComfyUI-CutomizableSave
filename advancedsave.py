"""
- AdvancedSave 커스텀 노드의 백엔드 로직을 정의합니다.
- SaveImage 노드를 상속받아 파일 이름 패턴 기능을 확장합니다.
"""
print("--- [My_Nodes] Debug: Starting to load advancedsave.py ---")

import os
import json
from datetime import datetime
import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import folder_paths

class AdvancedSave:
    # --- FIX: 세션 기반 카운터 ---
    # 세션 카운터 (ComfyUI 재시작 시 초기화)
    SESSION_COUNTER = 0

    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"
        self.compress_level = 4

    @classmethod
    def INPUT_TYPES(cls):
        """
        노드의 입력 파라미터를 정의합니다.
        - directory: 폴더 선택을 위한 입력. JS에서 동적으로 콤보 박스로 대체됩니다.
        """
        return {
            "required": {
                "images": ("IMAGE",),
                "directory": ("STRING", {"default": ""}),
                "filename_prefix": ("STRING", {"default": "ComfyUI"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                # --- FIX: format 입력 형식 수정 ---
                "format": (["png", "jpg", "webp"],),
                # --- FIX: quality 기본값을 100으로 변경 ---
                "quality": ("INT", {"default": 100, "min": 1, "max": 100}),
                "filename_pattern": ("STRING", {
                    "default": '["[prefix]", "_", "[seed]", "_", "[counter]"]',
                    "multiline": True
                }),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ()
    FUNCTION = "save_images_custom"
    OUTPUT_NODE = True
    CATEGORY = "MilleN2ium"

    def save_images_custom(self, images, directory, filename_prefix="ComfyUI", seed=0, format="png", quality=85, filename_pattern='[]', prompt=None, extra_pnginfo=None):
        print(f"--- [My_Nodes] Debug: save_images_custom called. Received {len(images)} image(s). ---")
        
        directory_name = directory
        print(f"--- [My_Nodes] Debug: Selected directory name: '{directory_name}'")

        if not directory_name or ".." in directory_name or directory_name.startswith("/"):
            full_output_folder = self.output_dir
        else:
            full_output_folder = os.path.join(self.output_dir, directory_name)
        
        os.makedirs(full_output_folder, exist_ok=True)
        print(f"--- [My_Nodes] Debug: Final output folder path: '{full_output_folder}'")

        print(f"--- [My_Nodes] Debug: Received raw filename_pattern string: '{filename_pattern}'")
        try:
            pattern_parts = json.loads(filename_pattern)
            filename_template = "".join(map(str, pattern_parts))
        except Exception as e:
            print(f"--- [My_Nodes] CRITICAL ERROR: Failed to parse filename_pattern. Using default. Reason: {e}")
            filename_template = f"{filename_prefix}_{seed}_[counter]"

        print(f"--- [My_Nodes] Debug: Filename template: '{filename_template}'")
        
        metadata = PngInfo()
        if prompt is not None:
            metadata.add_text("prompt", json.dumps(prompt))
        if extra_pnginfo is not None:
            for key, value in extra_pnginfo.items():
                metadata.add_text(key, json.dumps(value))
        
        print(f"--- [My_Nodes] Debug: Metadata prepared.")

        results = []
        for idx, image in enumerate(images):
            i = 255. * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            
            now = datetime.now()

            # --- FIX: 세션 카운터 사용 ---
            # 클래스 변수에 저장된 세션 카운터 값을 사용하고, 이미지 저장 후 1 증가시킵니다.
            counter_value = AdvancedSave.SESSION_COUNTER
            
            replacements = {
                "[prefix]": filename_prefix,
                "[seed]": str(seed),
                "[counter]": f"{counter_value:05}",
                "[date]": now.strftime("%Y-%m-%d"),
                "[time]": now.strftime("%H-%M-%S"),
                "[width]": str(img.width),
                "[height]": str(img.height),
            }
            
            final_filename = filename_template
            for keyword, value in replacements.items():
                final_filename = final_filename.replace(keyword, value)

            file_path = os.path.join(full_output_folder, f"{final_filename}.{format}")
            
            print(f"--- [My_Nodes] Debug: Preparing to save image {idx + 1}/{len(images)} to path: '{file_path}' with counter {counter_value}")
            
            try:
                if format == 'png':
                    img.save(file_path, pnginfo=metadata, compress_level=self.compress_level)
                elif format == 'jpg':
                    # JPEG는 알파 채널을 지원하지 않으므로 RGB로 변환합니다.
                    img.convert("RGB").save(file_path, quality=quality, optimize=True)
                else:
                    # WebP 및 기타 형식 저장
                    img.save(file_path, quality=quality)
                print(f"--- [My_Nodes] Debug: Successfully executed save for image {idx + 1}.")
            except Exception as e:
                print(f"--- [My_Nodes] CRITICAL ERROR: Failed to save image {idx + 1}. Reason: {e}")

            results.append({
                "filename": f"{final_filename}.{format}",
                "subfolder": os.path.relpath(full_output_folder, self.output_dir).replace('\\', '/'),
                "type": self.type
            })
            
            AdvancedSave.SESSION_COUNTER += 1
        
        print(f"--- [My_Nodes] Debug: Finished processing. Session counter is now {AdvancedSave.SESSION_COUNTER}.")
        return {"ui": {"images": results}}

print("--- [My_Nodes] Debug: Finished loading advancedsave.py and defined AdvancedSave class ---")