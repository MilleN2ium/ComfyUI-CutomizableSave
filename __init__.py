ROOT_FOLDER_NAME = "ComfyUI-CustomizableSave"

"""
- ComfyUI의 커스텀 노드를 등록하고 관리합니다.
- API 엔드포인트를 설정하여 파일 시스템과 상호작용합니다.
"""
print(f"--- [{ROOT_FOLDER_NAME}] Debug: Starting to load __init__.py ---")

import os
import sys
import subprocess
import folder_paths
import server
from aiohttp import web

# --- Custom Node Import ---
# advancedsave.py 파일에서 AdvancedSave 클래스를 불러옵니다.
# 클래스 임포트 실패 시 에러를 명확하게 출력합니다.
try:
    from .advancedsave import AdvancedSave
    print(f"--- [{ROOT_FOLDER_NAME}] Debug: Successfully imported AdvancedSave class! ---")
except ImportError as e:
    print(f"--- [{ROOT_FOLDER_NAME}] ERROR: Failed to import from advancedsave.py. Check file name and location. Details: {e}")
    # 임포트 실패 시 노드 등록을 시도하지 않도록 빈 클래스를 만듭니다.
    AdvancedSave = None
except Exception as e:
    print(f"--- [{ROOT_FOLDER_NAME}] ERROR: An unexpected error occurred during import. Details: {e}")
    AdvancedSave = None


# --- API Endpoints ---
# ComfyUI 서버 인스턴스를 가져옵니다.
server_instance = server.PromptServer.instance

# output 폴더 내의 디렉토리 목록을 반환하는 API
print(f"--- [{ROOT_FOLDER_NAME}] Debug: Registering API endpoint at '/{ROOT_FOLDER_NAME}/get_output_dirs'")
@server_instance.routes.get(f"/{ROOT_FOLDER_NAME}/get_output_dirs")
async def get_output_dirs(request):
    output_dir = folder_paths.get_output_directory()
    try:
        # os.listdir을 사용하여 디렉토리 목록을 가져오고 정렬합니다.
        dirs = sorted([d for d in os.listdir(output_dir) if os.path.isdir(os.path.join(output_dir, d))])
        print(f"--- [{ROOT_FOLDER_NAME}] Debug: Found directories: {dirs}")
        return web.json_response(dirs)
    except Exception as e:
        print(f"--- [{ROOT_FOLDER_NAME}] ERROR in get_output_dirs: {e}")
        return web.Response(status=500, text=str(e))

# 지정된 폴더를 운영체제의 파일 탐색기에서 여는 API
print(f"--- [{ROOT_FOLDER_NAME}] Debug: Registering API endpoint at '/{ROOT_FOLDER_NAME}/open_folder'")
@server_instance.routes.post(f"/{ROOT_FOLDER_NAME}/open_folder")
async def open_folder(request):
    try:
        json_data = await request.json()
        directory = json_data.get("directory")
        print(f"--- [{ROOT_FOLDER_NAME}] Debug: Received request to open folder: '{directory}'")
        output_dir = folder_paths.get_output_directory()
        
        # 경로 조작 공격을 방지하기 위한 검증
        if directory is None or ".." in directory or directory.startswith("/"):
            return web.Response(status=400, text="Invalid directory path.")

        full_path = os.path.join(output_dir, directory)

        if not os.path.isdir(full_path):
            return web.Response(status=404, text=f"Directory '{directory}' not found.")

        # 운영체제에 따라 폴더를 여는 명령어를 실행합니다.
        if sys.platform == "win32":
            os.startfile(os.path.realpath(full_path))
        elif sys.platform == "darwin": # macOS
            subprocess.run(["open", os.path.realpath(full_path)])
        else: # Linux
            subprocess.run(["xdg-open", os.path.realpath(full_path)])

        return web.Response(status=200, text="Folder opened successfully.")
    except Exception as e:
        print(f"--- [{ROOT_FOLDER_NAME}] ERROR in open_folder: {e}")
        return web.Response(status=500, text=str(e))

print(f"--- [{ROOT_FOLDER_NAME}] Debug: Setting up MAPPINGS... ---")


# --- Node Mappings ---
# 등록할 노드 정보를 딕셔너리로 관리하여 확장성을 높입니다.
NODE_DEFINITIONS = {
    "AdvancedSave": {
        "class": AdvancedSave,
        "name": "Customizable Save"
    },
    # 나중에 다른 노드를 추가하려면 여기에 추가
    # "MyOtherNode": {"class": MyOtherNodeClass, "name": "My Other Node"},
}

# ComfyUI가 요구하는 형식으로 매핑 변수들을 동적으로 생성합니다.
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# AdvancedSave 클래스가 성공적으로 임포트되었는지 확인 후 노드를 등록합니다.
if AdvancedSave:
    for node_identifier, node_info in NODE_DEFINITIONS.items():
        NODE_CLASS_MAPPINGS[node_identifier] = node_info["class"]
        NODE_DISPLAY_NAME_MAPPINGS[node_identifier] = node_info["name"]
        print(f"--- [{ROOT_FOLDER_NAME}] Debug: Registered node '{node_identifier}' -> '{node_info['name']}' ---")
else:
    print(f"--- [{ROOT_FOLDER_NAME}] Warning: AdvancedSave class not imported, node will not be registered. ---")


# --- Web Directory ---
# JavaScript 파일이 위치한 폴더를 ComfyUI에 알립니다.
WEB_DIRECTORY = "js"

print(f"--- [{ROOT_FOLDER_NAME}] Debug: Finished loading __init__.py. ---")