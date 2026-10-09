FROM python:3.12-slim
RUN pip install --no-cache-dir pillow==11.0.0
WORKDIR /app
COPY spacebooks_template.py app.py ./
ENV PYTHONUNBUFFERED=1
USER nobody
CMD ["python", "app.py"]
