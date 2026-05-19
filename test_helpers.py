import unittest

from aria.rag import split_text
from aria.security import MAX_UPLOAD_BYTES, validate_pdf_upload


class SecurityTests(unittest.TestCase):
    def test_validate_pdf_upload_rejects_empty_file(self) -> None:
        with self.assertRaisesRegex(ValueError, "empty"):
            validate_pdf_upload("report.pdf", 0)

    def test_validate_pdf_upload_rejects_path_like_name(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid"):
            validate_pdf_upload("../report.pdf", 128)

    def test_validate_pdf_upload_rejects_oversized_file(self) -> None:
        with self.assertRaisesRegex(ValueError, "too large"):
            validate_pdf_upload("report.pdf", MAX_UPLOAD_BYTES + 1)


class SplitTextTests(unittest.TestCase):
    def test_split_text_rejects_invalid_overlap(self) -> None:
        with self.assertRaisesRegex(ValueError, "overlap"):
            split_text("abc", chunk_size=10, overlap=10)

    def test_split_text_chunks_with_overlap(self) -> None:
        chunks = split_text("abcdefghij", chunk_size=4, overlap=1)
        self.assertEqual(chunks, ["abcd", "defg", "ghij", "j"])


if __name__ == "__main__":
    unittest.main()
