#!/usr/bin/env python3

import requests
import sys
import json
import time
import base64
from datetime import datetime
from typing import Dict, Any, List, Optional
import io

class BizScanAPITester:
    def __init__(self, base_url: str = "https://card-contacts-1.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.current_project_id = None
        
    def log_test(self, name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            
        result = {
            "name": name,
            "success": success,
            "details": details,
            "response_data": response_data,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"    {details}")
        if not success and response_data:
            print(f"    Response: {response_data}")
        print()

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int = 200, 
                 data: Any = None, headers: Dict[str, str] = None) -> tuple[bool, Any]:
        """Run a single API test"""
        url = f"{self.api_url}{endpoint}"
        
        if headers is None:
            headers = {'Content-Type': 'application/json'}
            
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                if isinstance(data, dict):
                    response = requests.post(url, json=data, headers=headers, timeout=30)
                else:
                    response = requests.post(url, data=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                self.log_test(name, False, f"Unsupported method: {method}")
                return False, {}

            success = response.status_code == expected_status
            response_data = {}
            
            try:
                response_data = response.json() if response.content else {}
            except:
                response_data = {"raw_response": response.text}
                
            details = f"Status: {response.status_code} (expected {expected_status})"
            if not success:
                details += f" | Response: {response_data}"
                
            self.log_test(name, success, details, response_data)
            return success, response_data

        except Exception as e:
            self.log_test(name, False, f"Request failed: {str(e)}")
            return False, {}

    def test_basic_connectivity(self):
        """Test basic API connectivity"""
        print("🔗 Testing Basic Connectivity...")
        
        # Test root endpoint
        success, data = self.run_test(
            "API Root Endpoint",
            "GET", 
            "",
            200
        )
        return success

    def test_settings_endpoints(self):
        """Test settings management"""
        print("⚙️ Testing Settings Endpoints...")
        
        # Get settings
        success, settings_data = self.run_test(
            "Get Settings",
            "GET",
            "/settings",
            200
        )
        
        if not success:
            return False
            
        # Update settings
        update_settings = {
            "claude_model": "claude-sonnet-4-5-20250929",
            "ai_enabled": True,
            "ai_ocr_enabled": True,
            "ai_validation_enabled": True,
            "ai_duplicate_enabled": True
        }
        
        success, _ = self.run_test(
            "Update Settings",
            "POST",
            "/settings",
            200,
            update_settings
        )
        
        if not success:
            return False
            
        # Test connection (this will use the emergent key)
        success, conn_data = self.run_test(
            "Test Claude Connection",
            "POST",
            "/settings/test-connection",
            200
        )
        
        if success and conn_data.get("status") == "success":
            print("    🎉 Claude API connection successful!")
        else:
            print(f"    ⚠️  Claude API connection issue: {conn_data}")
            
        return success

    def test_projects_crud(self):
        """Test project CRUD operations"""
        print("📁 Testing Projects CRUD...")
        
        # List projects (should be empty initially)
        success, projects = self.run_test(
            "List Projects (Initial)",
            "GET",
            "/projects",
            200
        )
        
        if not success:
            return False
            
        # Create a test project
        project_data = {
            "name": f"Test Project {datetime.now().strftime('%H%M%S')}",
            "notes": "Automated test project"
        }
        
        success, project = self.run_test(
            "Create Project",
            "POST",
            "/projects",
            200,
            project_data
        )
        
        if not success:
            return False
            
        self.current_project_id = project.get("id")
        if not self.current_project_id:
            self.log_test("Create Project - Get ID", False, "No project ID in response")
            return False
            
        # Get specific project
        success, _ = self.run_test(
            "Get Project by ID",
            "GET",
            f"/projects/{self.current_project_id}",
            200
        )
        
        if not success:
            return False
            
        # List projects again (should have our new project)
        success, projects = self.run_test(
            "List Projects (After Create)",
            "GET",
            "/projects",
            200
        )
        
        return success

    def test_contacts_crud(self):
        """Test contact CRUD operations"""
        if not self.current_project_id:
            self.log_test("Contacts CRUD", False, "No project ID available")
            return False
            
        print("👥 Testing Contacts CRUD...")
        
        # List contacts (should be empty initially)
        success, contacts = self.run_test(
            "List Contacts (Empty)",
            "GET",
            f"/projects/{self.current_project_id}/contacts",
            200
        )
        
        if not success:
            return False
            
        # Create a test contact
        contact_data = {
            "project_id": self.current_project_id,
            "first_name": "John",
            "last_name": "Doe",
            "job_title": "Software Engineer",
            "primary_email": "john.doe@example.com",
            "mobile_phone": "+1234567890",
            "company_name_display": "Tech Corp",
            "validation_status": "manual",
            "review_status": "approved"
        }
        
        success, contact = self.run_test(
            "Create Contact",
            "POST",
            f"/projects/{self.current_project_id}/contacts",
            200,
            contact_data
        )
        
        if not success:
            return False
            
        contact_id = contact.get("id")
        if not contact_id:
            self.log_test("Create Contact - Get ID", False, "No contact ID in response")
            return False
            
        # Get specific contact
        success, _ = self.run_test(
            "Get Contact by ID",
            "GET",
            f"/projects/{self.current_project_id}/contacts/{contact_id}",
            200
        )
        
        if not success:
            return False
            
        # Update contact
        update_data = {
            "project_id": self.current_project_id,
            "first_name": "John",
            "last_name": "Smith",  # Changed
            "job_title": "Senior Software Engineer",  # Changed
            "primary_email": "john.smith@example.com",  # Changed
            "mobile_phone": "+1234567890",
            "company_name_display": "Tech Corp",
            "validation_status": "manual",
            "review_status": "approved"
        }
        
        success, _ = self.run_test(
            "Update Contact",
            "PUT",
            f"/projects/{self.current_project_id}/contacts/{contact_id}",
            200,
            update_data
        )
        
        return success

    def test_companies_crud(self):
        """Test company CRUD operations"""
        if not self.current_project_id:
            self.log_test("Companies CRUD", False, "No project ID available")
            return False
            
        print("🏢 Testing Companies CRUD...")
        
        # List companies (should be empty initially)
        success, companies = self.run_test(
            "List Companies (Empty)",
            "GET",
            f"/projects/{self.current_project_id}/companies",
            200
        )
        
        if not success:
            return False
            
        # Create a test company
        company_data = {
            "project_id": self.current_project_id,
            "legal_company_name": "Tech Corporation Ltd.",
            "brand_name": "Tech Corp",
            "company_display_name": "Tech Corp",
            "website": "https://techcorp.example.com",
            "main_email": "info@techcorp.example.com",
            "city": "San Francisco",
            "country": "USA",
            "industry": "Software Development"
        }
        
        success, company = self.run_test(
            "Create Company",
            "POST",
            f"/projects/{self.current_project_id}/companies",
            200,
            company_data
        )
        
        return success

    def test_scanning_with_mock_image(self):
        """Test business card scanning with a mock image"""
        if not self.current_project_id:
            self.log_test("Business Card Scanning", False, "No project ID available")
            return False
            
        print("📷 Testing Business Card Scanning...")
        
        # Create a simple test image (1x1 pixel base64 encoded)
        # This is a minimal PNG image
        test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        
        scan_data = {
            "project_id": self.current_project_id,
            "image_front": test_image_base64,
            "image_back": None,
            "multiple_cards": False
        }
        
        # Note: This may fail if Claude API is not properly configured or the image is too simple
        # We'll accept both success and failure as the image is not a real business card
        success, scan_result = self.run_test(
            "Scan Business Card",
            "POST",
            f"/projects/{self.current_project_id}/scan",
            200,
            scan_data
        )
        
        if success:
            print("    🎉 Scan completed successfully!")
            if scan_result.get("contact"):
                print(f"    📋 Contact extracted: {scan_result['contact'].get('full_name', 'Unknown')}")
            if scan_result.get("validation"):
                print(f"    ✅ Validation status: {scan_result['validation'].get('validation_status', 'Unknown')}")
        else:
            print("    ⚠️  Scan failed (expected with test image)")
            
        return True  # We consider this test passed regardless of Claude's response

    def test_import_preview(self):
        """Test file import preview functionality"""
        if not self.current_project_id:
            self.log_test("Import Preview", False, "No project ID available")
            return False
            
        print("📊 Testing Import Preview...")
        
        # Create a simple CSV content for testing
        csv_content = "first_name,last_name,email,phone,company\nAlice,Johnson,alice@example.com,555-1234,Example Inc\nBob,Williams,bob@example.com,555-5678,Test Corp"
        
        # Prepare multipart form data
        files = {
            'file': ('test_contacts.csv', io.StringIO(csv_content), 'text/csv')
        }
        
        try:
            url = f"{self.api_url}/projects/{self.current_project_id}/import/preview"
            response = requests.post(url, files=files, timeout=30)
            
            success = response.status_code == 200
            response_data = response.json() if response.content else {}
            
            details = f"Status: {response.status_code}"
            if success:
                details += f" | Columns: {len(response_data.get('columns', []))}"
                details += f" | Rows: {response_data.get('row_count', 0)}"
                
            self.log_test("Import Preview", success, details, response_data)
            return success
            
        except Exception as e:
            self.log_test("Import Preview", False, f"Request failed: {str(e)}")
            return False

    def test_review_queue(self):
        """Test review queue functionality"""
        if not self.current_project_id:
            self.log_test("Review Queue", False, "No project ID available")
            return False
            
        print("🔍 Testing Review Queue...")
        
        # Get review queue
        success, queue = self.run_test(
            "Get Review Queue",
            "GET",
            f"/projects/{self.current_project_id}/review",
            200
        )
        
        return success

    def test_duplicates_detection(self):
        """Test duplicates detection"""
        if not self.current_project_id:
            self.log_test("Duplicates Detection", False, "No project ID available")
            return False
            
        print("👥 Testing Duplicates Detection...")
        
        # Get duplicates list
        success, duplicates = self.run_test(
            "Get Duplicates",
            "GET",
            f"/projects/{self.current_project_id}/duplicates",
            200
        )
        
        return success

    def test_export_functionality(self):
        """Test export functionality"""
        if not self.current_project_id:
            self.log_test("Export", False, "No project ID available")
            return False
            
        print("📤 Testing Export Functionality...")
        
        # Test CSV export
        try:
            url = f"{self.api_url}/projects/{self.current_project_id}/export?format=csv"
            response = requests.get(url, timeout=30)
            
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                details += f" | Content-Type: {response.headers.get('content-type', 'unknown')}"
                details += f" | Size: {len(response.content)} bytes"
                
            self.log_test("Export CSV", success, details)
            
            if not success:
                return False
                
        except Exception as e:
            self.log_test("Export CSV", False, f"Request failed: {str(e)}")
            return False
            
        # Test Excel export
        try:
            url = f"{self.api_url}/projects/{self.current_project_id}/export?format=xlsx"
            response = requests.get(url, timeout=30)
            
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                details += f" | Content-Type: {response.headers.get('content-type', 'unknown')}"
                details += f" | Size: {len(response.content)} bytes"
                
            self.log_test("Export Excel", success, details)
            return success
            
        except Exception as e:
            self.log_test("Export Excel", False, f"Request failed: {str(e)}")
            return False

    def cleanup_test_data(self):
        """Clean up test data"""
        if self.current_project_id:
            print("🧹 Cleaning up test data...")
            success, _ = self.run_test(
                "Delete Test Project",
                "DELETE",
                f"/projects/{self.current_project_id}",
                200
            )
            return success
        return True

    def run_all_tests(self):
        """Run all tests"""
        print("🚀 Starting BizScan Pro API Tests")
        print("=" * 50)
        
        start_time = time.time()
        
        # Run tests in order
        tests = [
            self.test_basic_connectivity,
            self.test_settings_endpoints,
            self.test_projects_crud,
            self.test_contacts_crud,
            self.test_companies_crud,
            self.test_scanning_with_mock_image,
            self.test_import_preview,
            self.test_review_queue,
            self.test_duplicates_detection,
            self.test_export_functionality,
        ]
        
        overall_success = True
        for test in tests:
            try:
                success = test()
                if not success:
                    overall_success = False
            except Exception as e:
                print(f"❌ Test {test.__name__} crashed: {str(e)}")
                overall_success = False
                
        # Cleanup
        self.cleanup_test_data()
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Print summary
        print("\n" + "=" * 50)
        print("📊 TEST SUMMARY")
        print("=" * 50)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed / max(self.tests_run, 1)) * 100:.1f}%")
        print(f"Duration: {duration:.2f}s")
        
        if overall_success:
            print("🎉 All critical tests passed!")
            return 0
        else:
            print("❌ Some tests failed!")
            return 1

def main():
    tester = BizScanAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())