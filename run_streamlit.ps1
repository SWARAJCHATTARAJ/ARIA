Set-Location -LiteralPath $PSScriptRoot
& "C:\Users\Hp\AppData\Local\Programs\Python\Python313\python.exe" -m streamlit run app.py --server.port 8501 --server.headless true *> streamlit.server.log
