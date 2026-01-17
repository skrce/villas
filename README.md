# villarosa

# Standalone server for accommodation management (motel/hotel/rent)   

## Technologies

* Kotlin
* Spring
* MySQL  
* Spring Data Jpa
* Jackson
* Swagger
* Maven

---

## Configuration
Should create a new file in: src/main/resources with name: application-default.yml and copy content of application-default-template.yml into it, then update the: security password, database user and password

Requires:
 Java 21+
 MySQL 5.7+
 Maven 3.6+
---

# Build
In villarosa/ folder
* mvn clean install

To build with no tests:
* mvn clean install -DskipTests


# Run
Execute SQL script:
 /resources/database_setup.sql

In villarosa/ folder:
* mvn spring-boot:run

# Operate
Access http://localhost:9098/swagger-ui.html

---

## Endpoints

**Endpoint** -  /apartments

**Method** - GET

**No Request Parameters**

**Response**
        [
            {
            "id": 1,
            "capacity": 3,
            "orientation": "South",
            "view": "Lake",
            "regularPrice": 1500,
            "topSeasonPrice": 1800
            }
        ]



**Example**

    curl -X GET "http://<USER>:<PASSWORD>@localhost:9098/apartment" -H "accept: application/json"

---

**Endpoint** -  /customer

**Method** - POST

**Request Parameters**

| Name        | Type
| ------------- |-------------
| firstName     | String
| lastName      | String
| phone         | String
| address       | String

**Response**
        1

**Example**

    curl -X POST "http://<USER>:<PASSWORD>@localhost:9098/customer?address=some-street&firstName=fn&ln=dsfgsdfg&phone=123" -H "accept: application/json"
        
---

**Endpoint** -  /customer

**Method** - GET

**Request Parameters**

| Name        | Type
| ------------- |-------------
| firstName     | String
| phone         | String

**Response**

    [
        {
        "id": 2,
        "firstName": "fn",
        "lastName": "ln",
        "phone": "123",
        "address": "some-street"
        }
    ]

**Example**

    curl -H "Content-Type: application/json" -X GET 'http://<USER>:<PASSWORD>@localhost:9098/customerfirstName=test&phone=123456789
    
---

**Endpoint** -  /reservation

**Method** - POST

**Request Parameters**

| Name        | Type
| ------------- |-------------
| customerId     | Integer
| roomId         | Integer
| startDate      | String
| endDate        | String

**Response**

    1

**Example**

    curl -X POST "http://<USER>:<PASSWORD>@localhost:9098/reservation?customerId=1&endDate=2020-06-01&roomId=1&startDate=2020-05-01" -H "accept: application/json"
    
---


**Endpoint** -  /reservation/available-apartments

**Method** - GET

**Request Parameters**

| Name          | Type         |  
| ------------- |------------- 
| startDate     | String
| endDate       | String

**Response**

    [
        {
            "id": 1,
            "capacity": 3,
            "orientation": "South",
            "view": "Lake",
            "regularPrice": 1500,
            "topSeasonPrice": 1800
        },
        {
            "id": 2,
            "capacity": 3,
            "orientation": "South",
            "view": "Lake",
            "regularPrice": 1200,
            "topSeasonPrice": 1500
        }
]

**Example**

    curl -X GET "http://<USER>:<PASSWORD>@localhost:9098/reservation/available-apartments?endDate=2020-02-01&startDate=2020-01-01" -H "accept: application/json"
        
---


**Endpoint** -  /reservation/customer

**Method** - GET

**Request Parameters**

| Name          | Type         |  
| ------------- |------------- 
| customerId    | Integer

**Response**

    [
        {
            "id": 5,
            "customerId": 1,
            "roomId": 1,
            "startDate": "2020-05-01",
            "endDate": "2020-06-01"
            },
        {
            "id": 4,
            "customerId": 1,
            "roomId": 1,
            "startDate": "2020-02-11",
            "endDate": "2020-02-21"
        },
        {
            "id": 1,
            "customerId": 1,
            "roomId": 2,
            "startDate": "2020-02-01",
            "endDate": "2020-02-10"
        }
    ]


**Example**

    curl -X GET "http://<USER>:<PASSWORD>@localhost:9098/reservation/customer?customerId=1" -H "accept: application/json"


---


**Endpoint** -  /reservation

**Method** - DELETE

**Request Parameters**

| Name          | Type         |  
| ------------- |------------- 
| reservationId    | Integer

**Response**
    N/A


**Example**

    curl -X DELETE "http://<USER>:<PASSWORD>@localhost:9098/reservation/?reservationId=1" -H "accept: application/json"


---


**Endpoint** -  /reservation

**Method** - PATCH

**Request Parameters**

| Name          | Type         |  
| ------------- |------------- 
| reservationId    | Integer
| newRoomId        | Integer

**Response**
N/A


**Example**

    curl -X PATCH "http://<USER>:<PASSWORD>@localhost:9098/reservation/?newRoomId=1&reservationId=1" -H "accept: application/json"

        
